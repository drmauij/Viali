import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Syringe, Stethoscope } from "lucide-react";
import { format } from "date-fns";
import type { Unit } from "@shared/schema";

export default function Hospital() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Internal tab state
  const [activeTab, setActiveTab] = useState<"units" | "checklists">("units");

  // Hospital name states
  const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState(activeHospital?.name || "");

  // Anesthesia unit states
  const [anesthesiaUnitDialogOpen, setAnesthesiaUnitDialogOpen] = useState(false);
  const [selectedAnesthesiaUnitId, setSelectedAnesthesiaUnitId] = useState(activeHospital?.anesthesiaUnitId || "none");

  // Surgery unit states
  const [surgeryUnitDialogOpen, setSurgeryUnitDialogOpen] = useState(false);
  const [selectedSurgeryUnitId, setSelectedSurgeryUnitId] = useState(activeHospital?.surgeryUnitId || "none");

  // Seed data states
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);

  // Unit states
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({
    name: "",
    type: "",
  });

  // Checklist template states
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    recurrency: "",
    items: [] as string[],
    unitId: "",
    role: "",
    startDate: new Date().toISOString().split('T')[0],
  });
  const [newTemplateItem, setNewTemplateItem] = useState("");

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Fetch units
  const { data: units = [], isLoading: unitsLoading } = useQuery<Unit[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/units`],
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

  // Template mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/checklists/templates`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/templates/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/pending/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/count/${activeHospital?.id}`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/templates/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/pending/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/count/${activeHospital?.id}`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/templates/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/pending/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/count/${activeHospital?.id}`] });
      toast({ title: t("common.success"), description: t("admin.templateDeletedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToDeleteTemplate"), variant: "destructive" });
    },
  });

  // Hospital mutation
  const updateHospitalMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { name });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setHospitalDialogOpen(false);
      toast({ title: t("common.success"), description: t("admin.hospitalNameUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateHospitalName"), variant: "destructive" });
    },
  });

  // Anesthesia unit mutation
  const updateAnesthesiaUnitMutation = useMutation({
    mutationFn: async (anesthesiaUnitId: string | null) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}/anesthesia-unit`, { anesthesiaUnitId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setAnesthesiaUnitDialogOpen(false);
      toast({ title: t("common.success"), description: "Anesthesia unit updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to update anesthesia unit", variant: "destructive" });
    },
  });

  // Surgery unit mutation
  const updateSurgeryUnitMutation = useMutation({
    mutationFn: async (surgeryUnitId: string | null) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}/surgery-unit`, { surgeryUnitId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setSurgeryUnitDialogOpen(false);
      toast({ title: t("common.success"), description: "Surgery unit updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to update surgery unit", variant: "destructive" });
    },
  });

  // Seed hospital mutation
  const seedHospitalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/hospitals/${activeHospital?.id}/seed`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      // Invalidate all relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${activeHospital?.id}`] });
      // Invalidate item queries to show newly seeded medications
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      setSeedDialogOpen(false);
      
      const result = data.result || {};
      const message = `Added: ${result.unitsCreated || 0} units, ${result.surgeryRoomsCreated || 0} surgery rooms, ${result.adminGroupsCreated || 0} admin groups, ${result.medicationsCreated || 0} medications`;
      toast({ 
        title: "Hospital seeded successfully", 
        description: message,
      });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to seed hospital data", variant: "destructive" });
    },
  });

  const resetUnitForm = () => {
    setUnitForm({ name: "", type: "" });
    setEditingUnit(null);
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      recurrency: "",
      items: [],
      unitId: "",
      role: "",
      startDate: new Date().toISOString().split('T')[0],
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
    });
    setUnitDialogOpen(true);
  };

  const handleSaveUnit = () => {
    if (!unitForm.name) {
      toast({ title: t("common.error"), description: t("admin.unitNameRequired"), variant: "destructive" });
      return;
    }

    const data = {
      name: unitForm.name,
      type: unitForm.type || null,
    };

    if (editingUnit) {
      updateUnitMutation.mutate({ id: editingUnit.id, data });
    } else {
      createUnitMutation.mutate(data);
    }
  };

  const handleAddTemplate = () => {
    resetTemplateForm();
    setTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      recurrency: template.recurrency,
      items: (template.items || []).map((item: any) => typeof item === 'string' ? item : (item.description || "")),
      unitId: template.unitId || "",
      role: template.role || "",
      startDate: template.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
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
    if (!templateForm.unitId) {
      toast({ title: t("common.error"), description: t("admin.unitRequired"), variant: "destructive" });
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
      unitId: templateForm.unitId,
      role: templateForm.role || null,
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

  const handleEditHospitalName = () => {
    setHospitalName(activeHospital?.name || "");
    setHospitalDialogOpen(true);
  };

  const handleSaveHospitalName = () => {
    if (!hospitalName.trim()) {
      toast({ title: t("common.error"), description: t("admin.hospitalNameRequired"), variant: "destructive" });
      return;
    }
    updateHospitalMutation.mutate(hospitalName);
  };

  const handleEditAnesthesiaUnit = () => {
    setSelectedAnesthesiaUnitId(activeHospital?.anesthesiaUnitId || "none");
    setAnesthesiaUnitDialogOpen(true);
  };

  const handleSaveAnesthesiaUnit = () => {
    updateAnesthesiaUnitMutation.mutate(
      selectedAnesthesiaUnitId === 'none' ? null : selectedAnesthesiaUnitId
    );
  };

  const handleEditSurgeryUnit = () => {
    setSelectedSurgeryUnitId(activeHospital?.surgeryUnitId || "none");
    setSurgeryUnitDialogOpen(true);
  };

  const handleSaveSurgeryUnit = () => {
    updateSurgeryUnitMutation.mutate(
      selectedSurgeryUnitId === 'none' ? null : selectedSurgeryUnitId
    );
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
        <h1 className="text-2xl font-bold text-foreground">{t("admin.hospital")}</h1>
      </div>

      {/* Hospital Info Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg">{activeHospital?.name}</h3>
            <p className="text-sm text-muted-foreground">{t("admin.hospitalName")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditHospitalName}
            data-testid="button-edit-hospital"
          >
            <i className="fas fa-edit mr-2"></i>
            {t("admin.editName")}
          </Button>
        </div>
      </div>

      {/* Anesthesia Unit Configuration Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Syringe 
              className={`w-5 h-5 mt-0.5 ${
                activeHospital?.anesthesiaUnitId 
                  ? 'text-green-500' 
                  : 'text-gray-400'
              }`} 
            />
            <div>
              <h3 className="font-semibold text-foreground text-lg">
                Anesthesia Module Unit
              </h3>
              <p className="text-sm text-muted-foreground">
                {activeHospital?.anesthesiaUnitId 
                  ? units.find(l => l.id === activeHospital.anesthesiaUnitId)?.name || "Unit not found"
                  : "Not configured - anesthesia module disabled"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditAnesthesiaUnit}
            data-testid="button-edit-anesthesia-unit"
          >
            <i className="fas fa-edit mr-2"></i>
            Configure
          </Button>
        </div>
      </div>

      {/* Surgery Unit Configuration Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Stethoscope 
              className={`w-5 h-5 mt-0.5 ${
                activeHospital?.surgeryUnitId 
                  ? 'text-green-500' 
                  : 'text-gray-400'
              }`} 
            />
            <div>
              <h3 className="font-semibold text-foreground text-lg">
                Surgery Module Unit
              </h3>
              <p className="text-sm text-muted-foreground">
                {activeHospital?.surgeryUnitId 
                  ? units.find(l => l.id === activeHospital.surgeryUnitId)?.name || "Unit not found"
                  : "Not configured - surgery module disabled"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditSurgeryUnit}
            data-testid="button-edit-surgery-unit"
          >
            <i className="fas fa-edit mr-2"></i>
            Configure
          </Button>
        </div>
      </div>

      {/* Seed Default Data Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg">
              <i className="fas fa-database mr-2 text-primary"></i>
              Default Data Setup
            </h3>
            <p className="text-sm text-muted-foreground">
              Populate hospital with default units, surgery rooms, administration groups, and medications
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              <i className="fas fa-info-circle mr-1"></i>
              Only adds missing items - never replaces existing data
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSeedDialogOpen(true)}
            disabled={seedHospitalMutation.isPending}
            data-testid="button-seed-hospital"
          >
            {seedHospitalMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Seeding...
              </>
            ) : (
              <>
                <i className="fas fa-seedling mr-2"></i>
                Seed Default Data
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Internal Tab Switcher */}
      <div className="flex gap-2">
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "units"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setActiveTab("units")}
          data-testid="tab-units"
        >
          <i className="fas fa-location-dot mr-2"></i>
          {t("admin.units")}
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "checklists"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setActiveTab("checklists")}
          data-testid="tab-checklists"
        >
          <i className="fas fa-clipboard-check mr-2"></i>
          {t("admin.checklists")}
        </button>
      </div>

      {/* Units Tab Content */}
      {activeTab === "units" && (
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
      )}

      {/* Checklists Tab Content */}
      {activeTab === "checklists" && (
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
                          {t(`checklists.recurrency.${template.recurrency}`)}
                        </span>
                        {template.role && (
                          <span className="status-chip chip-muted text-xs">
                            {t(`checklists.role.${template.role}`)}
                          </span>
                        )}
                        {template.location && (
                          <span className="status-chip chip-muted text-xs">
                            {template.location.name}
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
      )}

      {/* Unit Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? t("admin.editUnit") : t("admin.addUnit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Input
                id="unit-type"
                value={unitForm.type}
                onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })}
                placeholder={t("admin.typePlaceholder")}
                data-testid="input-unit-type"
              />
            </div>
            <div className="flex gap-2 justify-end">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t("admin.editTemplate") : t("admin.addTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                  <SelectItem value="daily">{t("checklists.recurrency.daily")}</SelectItem>
                  <SelectItem value="weekly">{t("checklists.recurrency.weekly")}</SelectItem>
                  <SelectItem value="monthly">{t("checklists.recurrency.monthly")}</SelectItem>
                  <SelectItem value="yearly">{t("checklists.recurrency.yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="template-location">{t("admin.location")} *</Label>
                <Select
                  value={templateForm.unitId}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, unitId: value })}
                >
                  <SelectTrigger data-testid="select-template-location">
                    <SelectValue placeholder={t("admin.selectLocation")} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="template-role">{t("admin.role")} ({t("checklists.optional")})</Label>
                <Select
                  value={templateForm.role}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, role: value })}
                >
                  <SelectTrigger data-testid="select-template-role">
                    <SelectValue placeholder={t("admin.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("checklists.role.admin")}</SelectItem>
                    <SelectItem value="staff">{t("checklists.role.staff")}</SelectItem>
                    <SelectItem value="nurse">{t("checklists.role.nurse")}</SelectItem>
                    <SelectItem value="doctor">{t("checklists.role.doctor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                    {templateForm.startDate ? format(new Date(templateForm.startDate), "PPP") : t("admin.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={templateForm.startDate ? new Date(templateForm.startDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setTemplateForm({ ...templateForm, startDate: format(date, "yyyy-MM-dd") });
                        setDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>{t("admin.checklistItems")} *</Label>
              <div className="space-y-2">
                {templateForm.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input value={item} disabled className="flex-1" data-testid={`item-${index}`} />
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
            <div className="flex gap-2 justify-end">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Hospital Name Dialog */}
      <Dialog open={hospitalDialogOpen} onOpenChange={setHospitalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.editHospitalName")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hospital-name">{t("admin.hospitalNameLabel")} *</Label>
              <Input
                id="hospital-name"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder={t("admin.hospitalNamePlaceholder")}
                data-testid="input-hospital-name"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setHospitalDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveHospitalName}
                disabled={updateHospitalMutation.isPending}
                data-testid="button-save-hospital"
              >
                {t("common.edit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Anesthesia Unit Dialog */}
      <Dialog open={anesthesiaUnitDialogOpen} onOpenChange={setAnesthesiaUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Anesthesia Module Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="anesthesia-unit">Select Unit</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Choose which unit's inventory will be used for anesthesia medications and infusions.
                Only users assigned to this unit can access the anesthesia module.
              </p>
              <Select
                value={selectedAnesthesiaUnitId}
                onValueChange={setSelectedAnesthesiaUnitId}
              >
                <SelectTrigger id="anesthesia-unit" data-testid="select-anesthesia-unit">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" data-testid="option-none">
                    None (Disable anesthesia module)
                  </SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id} data-testid={`option-unit-${unit.id}`}>
                      {unit.name} {unit.type ? `(${unit.type})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAnesthesiaUnitDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveAnesthesiaUnit}
                disabled={updateAnesthesiaUnitMutation.isPending}
                data-testid="button-save-anesthesia-unit"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Surgery Unit Dialog */}
      <Dialog open={surgeryUnitDialogOpen} onOpenChange={setSurgeryUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Surgery Module Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="surgery-unit">Select Unit</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Doctors assigned to this unit will be available as surgeons
              </p>
              <Select
                value={selectedSurgeryUnitId}
                onValueChange={setSelectedSurgeryUnitId}
              >
                <SelectTrigger id="surgery-unit" data-testid="select-surgery-unit">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" data-testid="option-none-surgery">
                    None (Disable surgery module)
                  </SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id} data-testid={`option-surgery-unit-${unit.id}`}>
                      {unit.name} {unit.type ? `(${unit.type})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSurgeryUnitDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveSurgeryUnit}
                disabled={updateSurgeryUnitMutation.isPending}
                data-testid="button-save-surgery-unit"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Seed Hospital Confirmation Dialog */}
      <AlertDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
        <AlertDialogContent data-testid="dialog-seed-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Seed Hospital with Default Data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will add the following default data to your hospital:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>4 Units:</strong> Anesthesy, OR, ER, ICU</li>
                <li><strong>3 Surgery Rooms:</strong> OP1, OP2, OP3</li>
                <li><strong>5 Administration Groups:</strong> Infusions, Pumps, Bolus, Short IVs, Antibiotics</li>
                <li><strong>13 Medications:</strong> Common anesthesia medications with complete configuration</li>
              </ul>
              <p className="text-xs mt-2 text-muted-foreground">
                <i className="fas fa-shield-check mr-1"></i>
                <strong>Safe operation:</strong> Only adds items that don't already exist. Your existing data will not be modified or deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-seed">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => seedHospitalMutation.mutate()}
              disabled={seedHospitalMutation.isPending}
              data-testid="button-confirm-seed"
            >
              {seedHospitalMutation.isPending ? "Seeding..." : "Seed Default Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
