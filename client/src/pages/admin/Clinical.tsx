import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Trash2, FileText, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateLong, formatDateForInput } from "@/lib/dateUtils";
import type { Unit } from "@shared/schema";
import { DischargeBriefTemplateManager } from "@/components/dischargeBriefs/DischargeBriefTemplateManager";

// Unit type options for dropdown (alphabetical order)
const UNIT_TYPES = [
  { value: "anesthesia", labelKey: "admin.unitTypes.anesthesia" },
  { value: "business", labelKey: "admin.unitTypes.business" },
  { value: "clinic", labelKey: "admin.unitTypes.clinic" },
  { value: "er", labelKey: "admin.unitTypes.er" },
  { value: "icu", labelKey: "admin.unitTypes.icu" },
  { value: "logistic", labelKey: "admin.unitTypes.logistic" },
  { value: "or", labelKey: "admin.unitTypes.or" },
  { value: "pharmacy", labelKey: "admin.unitTypes.pharmacy" },
  { value: "storage", labelKey: "admin.unitTypes.storage" },
  { value: "ward", labelKey: "admin.unitTypes.ward" },
] as const;

type SurgeryRoom = { id: string; name: string; type: 'OP' | 'PACU'; hospitalId: string; sortOrder: number; createdAt: string };

export default function Clinical() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Internal tab state
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const validTabs = ["units", "rooms", "checklists", "templates"];
  const [activeTab, setActiveTab] = useState<"units" | "rooms" | "checklists" | "templates">(
    urlTab && validTabs.includes(urlTab) ? urlTab as any : "units"
  );

  // Rooms management state
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [roomFormName, setRoomFormName] = useState('');
  const [roomFormType, setRoomFormType] = useState<'OP' | 'PACU'>('OP');

  // Unit states
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({
    name: "",
    type: "",
    showInventory: true,
    showAppointments: true,
    showControlledMedications: false,
    hasOwnCalendar: false,
    questionnairePhone: "",
    infoFlyerUrl: "",
  });
  const [infoFlyerUploading, setInfoFlyerUploading] = useState(false);

  // Checklist template states
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    recurrency: "",
    items: [] as string[],
    assignments: [{ unitId: "", role: "" }] as { unitId: string; role: string }[],
    roomIds: [] as string[],
    excludeWeekends: false,
    startDate: formatDateForInput(new Date()),
  });
  const [newTemplateItem, setNewTemplateItem] = useState("");

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Fetch units
  const { data: units = [], isLoading: unitsLoading } = useQuery<Unit[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/units`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Fetch surgery rooms
  const { data: surgeryRooms = [], isLoading: roomsLoading } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Fetch checklist templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: [`/api/checklists/templates/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Unit mutations
  const createUnitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/units`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      setUnitDialogOpen(false);
      resetUnitForm();
      toast({ title: t("common.success"), description: t("admin.unitCreatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateUnit"), variant: "destructive" });
    },
  });

  const updateUnitMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/units/${id}`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setUnitDialogOpen(false);
      resetUnitForm();
      toast({ title: t("common.success"), description: t("admin.unitUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateUnit"), variant: "destructive" });
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/units/${id}?hospitalId=${activeHospital?.id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      toast({ title: t("common.success"), description: t("admin.unitDeletedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteUnit"), variant: "destructive" });
    },
  });

  // Surgery Room mutations
  const createRoomMutation = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: 'OP' | 'PACU' }) => {
      return apiRequest('POST', `/api/surgery-rooms`, { hospitalId: activeHospital?.id, name, type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      toast({ title: t('common.success'), description: t('admin.roomCreated', 'Room created successfully') });
      setRoomDialogOpen(false);
      setRoomFormName('');
      setRoomFormType('OP');
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message || t('admin.failedToCreateRoom', 'Failed to create room'), variant: "destructive" });
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: async ({ roomId, name, type }: { roomId: string; name: string; type: 'OP' | 'PACU' }) => {
      return apiRequest('PUT', `/api/surgery-rooms/${roomId}`, { name, type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      toast({ title: t('common.success'), description: t('admin.roomUpdated', 'Room updated successfully') });
      setRoomDialogOpen(false);
      setEditingRoom(null);
      setRoomFormName('');
      setRoomFormType('OP');
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message || t('admin.failedToUpdateRoom', 'Failed to update room'), variant: "destructive" });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return apiRequest('DELETE', `/api/surgery-rooms/${roomId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      toast({ title: t('common.success'), description: t('admin.roomDeleted', 'Room deleted successfully') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message || t('admin.failedToDeleteRoom', 'Cannot delete room - it may have surgeries scheduled'), variant: "destructive" });
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

  // Template mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/checklists/templates`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' &&
            key[0].includes('/api/checklists') && key[0].includes(activeHospital?.id || '');
        },
      });
      setTemplateDialogOpen(false);
      resetTemplateForm();
      toast({ title: t("common.success"), description: t("admin.templateCreatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToCreateTemplate"), variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/checklists/templates/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' &&
            key[0].includes('/api/checklists') && key[0].includes(activeHospital?.id || '');
        },
      });
      setTemplateDialogOpen(false);
      resetTemplateForm();
      toast({ title: t("common.success"), description: t("admin.templateUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateTemplate"), variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/checklists/templates/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' &&
            key[0].includes('/api/checklists') && key[0].includes(activeHospital?.id || '');
        },
      });
      toast({ title: t("common.success"), description: t("admin.templateDeletedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteTemplate"), variant: "destructive" });
    },
  });

  const resetUnitForm = () => {
    setUnitForm({
      name: "",
      type: "",
      showInventory: true,
      showAppointments: true,
      showControlledMedications: false,
      hasOwnCalendar: false,
      questionnairePhone: "",
      infoFlyerUrl: "",
    });
    setEditingUnit(null);
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      recurrency: "",
      items: [],
      assignments: [{ unitId: "", role: "" }],
      roomIds: [],
      excludeWeekends: false,
      startDate: formatDateForInput(new Date()),
    });
    setNewTemplateItem("");
    setEditingTemplate(null);
  };

  const handleAddUnit = () => {
    resetUnitForm();
    setUnitDialogOpen(true);
  };

  const handleEditUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitForm({
      name: unit.name,
      type: unit.type || "",
      showInventory: (unit as any).showInventory !== false,
      showAppointments: (unit as any).showAppointments !== false,
      showControlledMedications: (unit as any).showControlledMedications || false,
      hasOwnCalendar: (unit as any).hasOwnCalendar || false,
      questionnairePhone: unit.questionnairePhone || "",
      infoFlyerUrl: (unit as any).infoFlyerUrl || "",
    });
    setUnitDialogOpen(true);
  };

  const handleSaveUnit = () => {
    if (!unitForm.name) {
      toast({ title: t("common.error"), description: t("admin.unitNameRequired"), variant: "destructive" });
      return;
    }

    const type = unitForm.type || null;
    const data = {
      name: unitForm.name,
      type,
      showInventory: unitForm.showInventory,
      showAppointments: unitForm.showAppointments,
      showControlledMedications: unitForm.showControlledMedications,
      hasOwnCalendar: unitForm.hasOwnCalendar,
      questionnairePhone: unitForm.questionnairePhone || null,
      infoFlyerUrl: unitForm.infoFlyerUrl || null,
    };

    if (editingUnit) {
      updateUnitMutation.mutate({ id: editingUnit.id, data });
    } else {
      createUnitMutation.mutate(data);
    }
  };

  // Room helper functions
  const moveRoom = (roomId: string, direction: 'up' | 'down') => {
    const currentIndex = surgeryRooms.findIndex(r => r.id === roomId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= surgeryRooms.length) return;

    const newOrder = [...surgeryRooms];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, removed);

    reorderRoomsMutation.mutate(newOrder.map(r => r.id));
  };

  const handleAddTemplate = () => {
    resetTemplateForm();
    setTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    const assignments = template.assignments && template.assignments.length > 0
      ? template.assignments.map((a: any) => ({ unitId: a.unitId || "", role: a.role || "" }))
      : template.unitId
        ? [{ unitId: template.unitId || "", role: template.role || "" }]
        : [{ unitId: "", role: "" }];
    setTemplateForm({
      name: template.name,
      recurrency: template.recurrency,
      items: (template.items || []).map((item: any) => typeof item === 'string' ? item : (item.description || "")),
      assignments,
      roomIds: template.roomIds || [],
      excludeWeekends: template.excludeWeekends || false,
      startDate: formatDateForInput(template.startDate) || formatDateForInput(new Date()),
    });
    setTemplateDialogOpen(true);
  };

  const handleDuplicateTemplate = (template: any) => {
    setEditingTemplate(null);
    setTemplateForm({
      name: `${template.name} (${t("common.copy")})`,
      recurrency: template.recurrency,
      items: (template.items || []).map((item: any) => typeof item === 'string' ? item : (item.description || "")),
      assignments: template.assignments && template.assignments.length > 0
        ? template.assignments.map((a: any) => ({ unitId: a.unitId || "", role: a.role || "" }))
        : template.unitId
          ? [{ unitId: template.unitId || "", role: template.role || "" }]
          : [{ unitId: "", role: "" }],
      roomIds: template.roomIds || [],
      excludeWeekends: template.excludeWeekends || false,
      startDate: formatDateForInput(new Date()),
    });
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!templateForm.name.trim()) {
      toast({ title: t("common.error"), description: t("admin.templateNameRequired"), variant: "destructive" });
      return;
    }
    if (!templateForm.recurrency) {
      toast({ title: t("common.error"), description: t("admin.recurrencyRequired"), variant: "destructive" });
      return;
    }
    if (templateForm.assignments.length === 0) {
      toast({ title: t("common.error"), description: t("admin.atLeastOneAssignment", "At least one unit/role assignment is required"), variant: "destructive" });
      return;
    }
    if (templateForm.items.length === 0) {
      toast({ title: t("common.error"), description: t("admin.atLeastOneItem"), variant: "destructive" });
      return;
    }

    const data = {
      name: templateForm.name.trim(),
      recurrency: templateForm.recurrency,
      items: templateForm.items.filter(item => item.trim()).map(item => ({ description: item.trim() })),
      assignments: templateForm.assignments.map(a => ({
        unitId: a.unitId || null,
        role: a.role || null,
      })),
      roomIds: templateForm.roomIds,
      excludeWeekends: templateForm.excludeWeekends,
      startDate: templateForm.startDate,
    };

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleAddTemplateItem = () => {
    const trimmedItem = newTemplateItem.trim();
    if (!trimmedItem) {
      toast({ title: t("common.error"), description: t("admin.itemRequired"), variant: "destructive" });
      return;
    }
    if (templateForm.items.includes(trimmedItem)) {
      toast({ title: t("common.error"), description: t("admin.itemAlreadyExists"), variant: "destructive" });
      return;
    }
    setTemplateForm({
      ...templateForm,
      items: [...templateForm.items, trimmedItem],
    });
    setNewTemplateItem("");
  };

  const handleRemoveTemplateItem = (index: number) => {
    setTemplateForm({
      ...templateForm,
      items: templateForm.items.filter((_, i) => i !== index),
    });
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noHospitalSelected")}</h3>
          <p className="text-muted-foreground">{t("admin.selectHospitalFirst")}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-lock text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.adminAccessRequired")}</h3>
          <p className="text-muted-foreground">{t("admin.adminPrivilegesNeeded")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("admin.clinicalSetup", "Clinical Setup")}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Vertical sidebar nav */}
          <TabsList className="flex flex-row md:flex-col h-auto w-full md:w-52 shrink-0 justify-start overflow-x-auto md:overflow-x-visible scrollbar-hide bg-muted/50 md:bg-transparent p-1 md:p-0 md:gap-1">
            <TabsTrigger value="units" data-testid="tab-units" className="justify-start md:w-full">
              <i className="fas fa-location-dot mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.units")}</span>
            </TabsTrigger>
            <TabsTrigger value="rooms" data-testid="tab-rooms" className="justify-start md:w-full">
              <i className="fas fa-door-open mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.rooms", "Rooms")}</span>
            </TabsTrigger>
            <TabsTrigger value="checklists" data-testid="tab-checklists" className="justify-start md:w-full">
              <i className="fas fa-clipboard-check mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.checklists")}</span>
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates" className="justify-start md:w-full">
              <i className="fas fa-file-lines mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.templates", "Templates")}</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab content area */}
          <div className="flex-1 min-w-0">

        {/* Units Tab Content */}
        <TabsContent value="units">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">{t("admin.units")}</h2>
            <Button onClick={handleAddUnit} size="sm" data-testid="button-add-unit">
              <i className="fas fa-plus mr-2"></i>
              {t("admin.addUnit")}
            </Button>
          </div>

          {unitsLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : units.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-location-dot text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noUnits")}</h3>
              <p className="text-muted-foreground mb-4">{t("admin.noUnitsMessage")}</p>
              <Button onClick={handleAddUnit} size="sm">
                <i className="fas fa-plus mr-2"></i>
                {t("admin.addUnit")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {units.map((unit) => (
                <div key={unit.id} className="bg-card border border-border rounded-lg p-4" data-testid={`unit-${unit.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{unit.name}</h3>
                      {unit.type && (
                        <p className="text-sm text-muted-foreground">{unit.type}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditUnit(unit)}
                        data-testid={`button-edit-unit-${unit.id}`}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("admin.deleteUnitConfirm"))) {
                            deleteUnitMutation.mutate(unit.id);
                          }
                        }}
                        data-testid={`button-delete-unit-${unit.id}`}
                      >
                        <i className="fas fa-trash text-destructive"></i>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </TabsContent>

        {/* Rooms Tab Content */}
        <TabsContent value="rooms">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">{t("admin.rooms", "Rooms")}</h2>
            <Button
              onClick={() => {
                setEditingRoom(null);
                setRoomFormName('');
                setRoomFormType('OP');
                setRoomDialogOpen(true);
              }}
              size="sm"
              data-testid="button-add-room"
            >
              <i className="fas fa-plus mr-2"></i>
              {t("admin.addRoom", "Add Room")}
            </Button>
          </div>

          {roomsLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : surgeryRooms.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-door-open text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noRooms", "No rooms configured")}</h3>
              <p className="text-muted-foreground mb-4">{t("admin.noRoomsMessage", "Add surgery rooms to organize your schedules")}</p>
              <Button
                onClick={() => {
                  setEditingRoom(null);
                  setRoomFormName('');
                  setRoomFormType('OP');
                  setRoomDialogOpen(true);
                }}
                size="sm"
              >
                <i className="fas fa-plus mr-2"></i>
                {t("admin.addRoom", "Add Room")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {surgeryRooms.map((room, index) => (
                <div key={room.id} className="bg-card border border-border rounded-lg p-4" data-testid={`room-${room.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => moveRoom(room.id, 'up')}
                          disabled={index === 0}
                          className={`p-1 rounded hover:bg-muted ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                          data-testid={`button-move-room-up-${room.id}`}
                        >
                          <i className="fas fa-chevron-up text-xs"></i>
                        </button>
                        <button
                          onClick={() => moveRoom(room.id, 'down')}
                          disabled={index === surgeryRooms.length - 1}
                          className={`p-1 rounded hover:bg-muted ${index === surgeryRooms.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                          data-testid={`button-move-room-down-${room.id}`}
                        >
                          <i className="fas fa-chevron-down text-xs"></i>
                        </button>
                      </div>
                      <h3 className="font-semibold text-foreground">{room.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${room.type === 'PACU' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
                        {room.type || 'OP'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingRoom(room);
                          setRoomFormName(room.name);
                          setRoomFormType(room.type || 'OP');
                          setRoomDialogOpen(true);
                        }}
                        data-testid={`button-edit-room-${room.id}`}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteRoomMutation.mutate(room.id)}
                        disabled={deleteRoomMutation.isPending}
                        data-testid={`button-delete-room-${room.id}`}
                      >
                        <i className="fas fa-trash text-destructive"></i>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </TabsContent>


        {/* Checklists Tab Content */}
        <TabsContent value="checklists">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">{t("admin.checklists")}</h2>
            <Button onClick={handleAddTemplate} size="sm" data-testid="button-add-template">
              <i className="fas fa-plus mr-2"></i>
              {t("admin.addTemplate")}
            </Button>
          </div>

          {templatesLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-clipboard-check text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noTemplates")}</h3>
              <p className="text-muted-foreground mb-4">{t("admin.noTemplatesMessage")}</p>
              <Button onClick={handleAddTemplate} size="sm">
                <i className="fas fa-plus mr-2"></i>
                {t("admin.addTemplate")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="bg-card border border-border rounded-lg p-4" data-testid={`template-${template.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{template.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2 text-sm text-muted-foreground">
                        <span className="status-chip chip-primary text-xs">
                          {String(t(`checklists.recurrency.${template.recurrency}`, template.recurrency))}
                        </span>
                        {template.assignments && template.assignments.length > 0 ? (
                          template.assignments.map((a: any, idx: number) => (
                            <span key={idx} className="status-chip chip-muted text-xs">
                              {a.unitId ? units.find(u => u.id === a.unitId)?.name || a.unitId : t("admin.allUnits", "All units")}
                              {a.role ? ` / ${t(`checklists.role.${a.role}`, a.role)}` : ""}
                            </span>
                          ))
                        ) : template.role ? (
                          <span className="status-chip chip-muted text-xs">
                            {t(`checklists.role.${template.role}`)}
                          </span>
                        ) : null}
                        {template.excludeWeekends && (
                          <span className="status-chip chip-muted text-xs">
                            <i className="fas fa-calendar-xmark mr-1"></i>{t("admin.noWeekends", "No weekends")}
                          </span>
                        )}
                        {template.roomIds && template.roomIds.length > 0 && (
                          <span className="status-chip chip-muted text-xs">
                            <i className="fas fa-door-open mr-1"></i>{template.roomIds.length} {t("admin.rooms", "Rooms")}
                          </span>
                        )}
                        <span className="text-xs">
                          {template.items?.length || 0} {t("checklists.items")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicateTemplate(template)}
                        data-testid={`button-duplicate-template-${template.id}`}
                      >
                        <i className="fas fa-copy"></i>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("admin.deleteTemplateConfirm"))) {
                            deleteTemplateMutation.mutate(template.id);
                          }
                        }}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <i className="fas fa-trash text-destructive"></i>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
        </TabsContent>

        {/* Templates Tab Content */}
        <TabsContent value="templates">
        <div className="space-y-4">
          {activeHospital && (
            <DischargeBriefTemplateManager
              hospitalId={activeHospital.id}
              isAdmin={true}
              units={units.map((u) => ({ id: u.id, name: u.name }))}
            />
          )}
        </div>
        </TabsContent>

          </div>
        </div>
      </Tabs>

      {/* Unit Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingUnit ? t("admin.editUnit") : t("admin.addUnit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            <div>
              <Label htmlFor="unit-name">{t("admin.unitName")} *</Label>
              <Input
                id="unit-name"
                value={unitForm.name}
                onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                placeholder={t("admin.unitPlaceholder")}
                data-testid="input-unit-name"
              />
            </div>
            <div>
              <Label htmlFor="unit-type">{t("admin.type")}</Label>
              <Select
                value={unitForm.type}
                onValueChange={(value) => setUnitForm({ ...unitForm, type: value })}
              >
                <SelectTrigger data-testid="select-unit-type">
                  <SelectValue placeholder={t("admin.selectUnitType")} />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {t(type.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-medium text-muted-foreground">{t("admin.uiVisibility")}</Label>
              <div className="space-y-3 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-inventory"
                    checked={unitForm.showInventory}
                    onCheckedChange={(checked) => setUnitForm({ ...unitForm, showInventory: !!checked })}
                    data-testid="checkbox-show-inventory"
                  />
                  <Label htmlFor="show-inventory" className="text-sm font-normal cursor-pointer">
                    {t("admin.showInventory")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-appointments"
                    checked={unitForm.showAppointments}
                    onCheckedChange={(checked) => setUnitForm({ ...unitForm, showAppointments: !!checked })}
                    data-testid="checkbox-show-appointments"
                  />
                  <Label htmlFor="show-appointments" className="text-sm font-normal cursor-pointer">
                    {t("admin.showAppointments")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-controlled-medications"
                    checked={unitForm.showControlledMedications}
                    onCheckedChange={(checked) => setUnitForm({ ...unitForm, showControlledMedications: !!checked })}
                    data-testid="checkbox-show-controlled-medications"
                  />
                  <Label htmlFor="show-controlled-medications" className="text-sm font-normal cursor-pointer">
                    {t("admin.showControlledMedications")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="has-own-calendar"
                    checked={unitForm.hasOwnCalendar}
                    onCheckedChange={(checked) => setUnitForm({ ...unitForm, hasOwnCalendar: !!checked })}
                    data-testid="checkbox-has-own-calendar"
                  />
                  <Label htmlFor="has-own-calendar" className="text-sm font-normal cursor-pointer">
                    {t("admin.hasOwnCalendar", "Has own calendar")}
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.hasOwnCalendarHint", "When enabled, this unit has its own calendar separate from the shared hospital calendar. When disabled (default), this unit shares the hospital-wide calendar with all other units.")}
              </p>
            </div>
            <Separator />
            <div>
              <Label htmlFor="questionnaire-phone">{t("admin.questionnairePhone")}</Label>
              <Input
                id="questionnaire-phone"
                value={unitForm.questionnairePhone}
                onChange={(e) => setUnitForm({ ...unitForm, questionnairePhone: e.target.value })}
                placeholder={t("admin.questionnairePhonePlaceholder")}
                data-testid="input-questionnaire-phone"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin.questionnairePhoneHint")}
              </p>
            </div>
            <div>
              <Label>{t("admin.infoFlyer", "Info Flyer (PDF)")}</Label>
              <div className="mt-2 space-y-2">
                {unitForm.infoFlyerUrl ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm flex-1 truncate">{t("admin.infoFlyerUploaded", "Info flyer uploaded")}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(unitForm.infoFlyerUrl, '_blank')}
                    >
                      {t("common.view", "View")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUnitForm({ ...unitForm, infoFlyerUrl: "" })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="application/pdf"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        if (file.type !== 'application/pdf') {
                          toast({ title: t("common.error"), description: t("admin.onlyPdfAllowed", "Only PDF files are allowed"), variant: "destructive" });
                          return;
                        }

                        if (!activeHospital?.id) {
                          toast({ title: t("common.error"), description: "No hospital selected", variant: "destructive" });
                          return;
                        }

                        setInfoFlyerUploading(true);
                        try {
                          const urlResponse = await fetch(`/api/admin/${activeHospital.id}/upload`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              filename: file.name,
                              folder: 'unit-info-flyers'
                            }),
                            credentials: 'include',
                          });

                          if (!urlResponse.ok) throw new Error('Failed to get upload URL');

                          const { uploadURL, storageKey } = await urlResponse.json();

                          const uploadResponse = await fetch(uploadURL, {
                            method: 'PUT',
                            body: file,
                            headers: {
                              'Content-Type': file.type,
                            },
                          });

                          if (!uploadResponse.ok) throw new Error('Upload failed');

                          setUnitForm({ ...unitForm, infoFlyerUrl: storageKey });
                          toast({ title: t("common.success"), description: t("admin.infoFlyerUploadSuccess", "Info flyer uploaded successfully") });
                        } catch (error) {
                          console.error("Upload error:", error);
                          toast({ title: t("common.error"), description: t("admin.infoFlyerUploadFailed", "Failed to upload info flyer"), variant: "destructive" });
                        } finally {
                          setInfoFlyerUploading(false);
                        }
                      }}
                      disabled={infoFlyerUploading}
                      data-testid="input-info-flyer"
                    />
                    {infoFlyerUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin.infoFlyerHint", "PDF document with info about this unit for patients")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveUnit}
              disabled={createUnitMutation.isPending || updateUnitMutation.isPending}
              data-testid="button-save-unit"
            >
              {editingUnit ? t("common.edit") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? t("admin.editRoom", "Edit Room") : t("admin.addRoom", "Add Room")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="room-name">{t("admin.roomName", "Room Name")} *</Label>
              <Input
                id="room-name"
                value={roomFormName}
                onChange={(e) => setRoomFormName(e.target.value)}
                placeholder={t("admin.roomNamePlaceholder", "e.g., OR 1, Recovery Room A")}
                data-testid="input-room-name"
              />
            </div>
            <div>
              <Label htmlFor="room-type">{t("admin.roomType", "Room Type")} *</Label>
              <Select value={roomFormType} onValueChange={(value: 'OP' | 'PACU') => setRoomFormType(value)}>
                <SelectTrigger data-testid="select-room-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OP">{t("admin.roomTypeOP", "OP (Operating Room)")}</SelectItem>
                  <SelectItem value="PACU">{t("admin.roomTypePACU", "PACU (Recovery)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (!roomFormName.trim()) {
                    toast({ title: t("common.error"), description: t("admin.roomNameRequired", "Room name is required"), variant: "destructive" });
                    return;
                  }
                  if (editingRoom) {
                    updateRoomMutation.mutate({ roomId: editingRoom.id, name: roomFormName.trim(), type: roomFormType });
                  } else {
                    createRoomMutation.mutate({ name: roomFormName.trim(), type: roomFormType });
                  }
                }}
                disabled={createRoomMutation.isPending || updateRoomMutation.isPending}
                data-testid="button-save-room"
              >
                {editingRoom ? t("common.edit") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingTemplate ? t("admin.editTemplate") : t("admin.addTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div>
              <Label htmlFor="template-name">{t("admin.templateName")} *</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder={t("admin.templateNamePlaceholder")}
                data-testid="input-template-name"
              />
            </div>
            <div>
              <Label htmlFor="template-recurrency">{t("admin.recurrency")} *</Label>
              <Select
                value={templateForm.recurrency}
                onValueChange={(value) => setTemplateForm({ ...templateForm, recurrency: value })}
              >
                <SelectTrigger data-testid="select-template-recurrency">
                  <SelectValue placeholder={t("admin.selectRecurrency")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("checklists.recurrency.daily", "Daily")}</SelectItem>
                  <SelectItem value="weekly">{t("checklists.recurrency.weekly", "Weekly")}</SelectItem>
                  <SelectItem value="monthly">{t("checklists.recurrency.monthly", "Monthly")}</SelectItem>
                  <SelectItem value="bimonthly">{t("checklists.recurrency.bimonthly", "Every 2 Months")}</SelectItem>
                  <SelectItem value="quarterly">{t("checklists.recurrency.quarterly", "Every 3 Months")}</SelectItem>
                  <SelectItem value="triannual">{t("checklists.recurrency.triannual", "Every 4 Months")}</SelectItem>
                  <SelectItem value="biannual">{t("checklists.recurrency.biannual", "Every 6 Months")}</SelectItem>
                  <SelectItem value="yearly">{t("checklists.recurrency.yearly", "Yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t("admin.assignments", "Unit / Role Assignments")} *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplateForm(prev => ({
                    ...prev,
                    assignments: [...prev.assignments, { unitId: "", role: "" }],
                  }))}
                  data-testid="button-add-assignment"
                >
                  <i className="fas fa-plus mr-1"></i> {t("admin.addAssignment", "Add")}
                </Button>
              </div>
              <div className="space-y-2">
                {templateForm.assignments.map((assignment, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={assignment.unitId || "__all__"}
                      onValueChange={(value) => {
                        const updated = [...templateForm.assignments];
                        updated[index] = { ...updated[index], unitId: value === "__all__" ? "" : value };
                        setTemplateForm(prev => ({ ...prev, assignments: updated }));
                      }}
                    >
                      <SelectTrigger className="flex-1" data-testid={`select-assignment-unit-${index}`}>
                        <SelectValue placeholder={t("admin.selectLocation")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("admin.allUnits", "All units")}</SelectItem>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={assignment.role || "__all__"}
                      onValueChange={(value) => {
                        const updated = [...templateForm.assignments];
                        updated[index] = { ...updated[index], role: value === "__all__" ? "" : value };
                        setTemplateForm(prev => ({ ...prev, assignments: updated }));
                      }}
                    >
                      <SelectTrigger className="flex-1" data-testid={`select-assignment-role-${index}`}>
                        <SelectValue placeholder={t("admin.selectRole")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("admin.allRoles", "All roles")}</SelectItem>
                        <SelectItem value="admin">{t("checklists.role.admin")}</SelectItem>
                        <SelectItem value="staff">{t("checklists.role.staff")}</SelectItem>
                        <SelectItem value="nurse">{t("checklists.role.nurse")}</SelectItem>
                        <SelectItem value="doctor">{t("checklists.role.doctor")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {templateForm.assignments.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const updated = templateForm.assignments.filter((_, i) => i !== index);
                          setTemplateForm(prev => ({ ...prev, assignments: updated }));
                        }}
                        data-testid={`button-remove-assignment-${index}`}
                      >
                        <i className="fas fa-trash text-destructive"></i>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {surgeryRooms.filter(r => r.type === 'OP').length > 0 && (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-door-open text-muted-foreground text-sm"></i>
                  <Label className="text-sm font-medium text-muted-foreground">{t("admin.rooms", "Rooms")} ({t("checklists.optional", "optional")})</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {surgeryRooms.filter(r => r.type === 'OP').map((room) => (
                    <label
                      key={room.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors ${
                        templateForm.roomIds.includes(room.id)
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-background border-border hover:bg-muted'
                      }`}
                      data-testid={`checkbox-room-${room.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={templateForm.roomIds.includes(room.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTemplateForm({ ...templateForm, roomIds: [...templateForm.roomIds, room.id] });
                          } else {
                            setTemplateForm({ ...templateForm, roomIds: templateForm.roomIds.filter((id: string) => id !== room.id) });
                          }
                        }}
                        className="rounded sr-only"
                      />
                      <span className="text-sm">{room.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{t("admin.roomsHelp", "Select rooms to track completion separately for each room. Leave empty for a general checklist.")}</p>
              </div>
            )}
            <div>
              <Label>{t("admin.startDate")} *</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="input-template-start-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {templateForm.startDate ? formatDateLong(templateForm.startDate) : t("admin.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={templateForm.startDate ? new Date(templateForm.startDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setTemplateForm({ ...templateForm, startDate: formatDateForInput(date) });
                        setDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="exclude-weekends"
                checked={templateForm.excludeWeekends}
                onChange={(e) => setTemplateForm({ ...templateForm, excludeWeekends: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
                data-testid="checkbox-exclude-weekends"
              />
              <Label htmlFor="exclude-weekends" className="text-sm font-normal cursor-pointer">
                {t("admin.excludeWeekends", "Exclude weekends (Sat-Sun)")}
              </Label>
            </div>
            <div>
              <Label>{t("admin.checklistItems")} *</Label>
              <div className="space-y-2">
                {templateForm.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={item}
                      onChange={(e) => {
                        const updated = [...templateForm.items];
                        updated[index] = e.target.value;
                        setTemplateForm(prev => ({ ...prev, items: updated }));
                      }}
                      className="flex-1"
                      data-testid={`item-${index}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveTemplateItem(index)}
                      data-testid={`button-remove-item-${index}`}
                    >
                      <i className="fas fa-trash text-destructive"></i>
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newTemplateItem}
                    onChange={(e) => setNewTemplateItem(e.target.value)}
                    placeholder={t("admin.addItemPlaceholder")}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTemplateItem();
                      }
                    }}
                    data-testid="input-new-item"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTemplateItem}
                    data-testid="button-add-item"
                  >
                    <i className="fas fa-plus"></i>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              data-testid="button-save-template"
            >
              {editingTemplate ? t("common.edit") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
