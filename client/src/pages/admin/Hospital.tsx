import { useState, useEffect } from "react";
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
import { CalendarIcon, Syringe, Stethoscope, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { formatDateLong } from "@/lib/dateUtils";
import type { Unit } from "@shared/schema";

// Unit type options for dropdown
const UNIT_TYPES = [
  { value: "or", labelKey: "admin.unitTypes.or" },
  { value: "icu", labelKey: "admin.unitTypes.icu" },
  { value: "er", labelKey: "admin.unitTypes.er" },
  { value: "ward", labelKey: "admin.unitTypes.ward" },
  { value: "pharmacy", labelKey: "admin.unitTypes.pharmacy" },
  { value: "anesthesia", labelKey: "admin.unitTypes.anesthesia" },
  { value: "storage", labelKey: "admin.unitTypes.storage" },
  { value: "business", labelKey: "admin.unitTypes.business" },
  { value: "clinic", labelKey: "admin.unitTypes.clinic" },
] as const;

export default function Hospital() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Internal tab state
  const [activeTab, setActiveTab] = useState<"units" | "checklists" | "suppliers">("units");

  // Supplier catalog states
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplierName: "Galexis",
    supplierType: "api" as "api" | "browser",
    customerNumber: "",
    apiPassword: "",
    browserLoginUrl: "https://shop.polymed.ch/de",
    browserUsername: "",
  });

  // Hospital name states
  const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState(activeHospital?.name || "");

  // Seed data states
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [resetListsDialogOpen, setResetListsDialogOpen] = useState(false);
  const [resetListsConfirmText, setResetListsConfirmText] = useState("");

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

  // Fetch supplier catalogs
  const { data: supplierCatalogs = [], isLoading: catalogsLoading } = useQuery<any[]>({
    queryKey: [`/api/supplier-catalogs/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Fetch price sync jobs
  const { data: priceSyncJobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery<any[]>({
    queryKey: [`/api/price-sync-jobs/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Determine if we need to poll for job updates
  const hasActiveJob = Array.isArray(priceSyncJobs) && priceSyncJobs.some((j: any) => j.status === 'queued' || j.status === 'processing');

  // Poll for job updates when there's an active job
  useEffect(() => {
    if (!hasActiveJob) return;
    
    const interval = setInterval(() => {
      refetchJobs();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [hasActiveJob, refetchJobs]);

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

  // Supplier catalog mutations
  const createCatalogMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/supplier-catalogs`, { ...data, hospitalId: activeHospital?.id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-catalogs/${activeHospital?.id}`] });
      setSupplierDialogOpen(false);
      setSupplierForm({ 
        supplierName: "Galexis", 
        supplierType: "api", 
        customerNumber: "", 
        apiPassword: "",
        browserLoginUrl: "https://shop.polymed.ch/de",
        browserUsername: "",
      });
      toast({ title: t("common.success"), description: "Supplier catalog created successfully" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to create supplier catalog", variant: "destructive" });
    },
  });

  const deleteCatalogMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/supplier-catalogs/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-catalogs/${activeHospital?.id}`] });
      toast({ title: t("common.success"), description: "Supplier catalog deleted" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to delete supplier catalog", variant: "destructive" });
    },
  });

  const triggerSyncMutation = useMutation({
    mutationFn: async (catalogId: string) => {
      const response = await apiRequest("POST", `/api/price-sync/trigger`, { catalogId });
      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/price-sync-jobs/${activeHospital?.id}`] });
      await refetchJobs();
      toast({ title: t("common.success"), description: "Price sync job queued" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to trigger price sync", variant: "destructive" });
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

  // Reset lists mutation
  const resetListsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/hospitals/${activeHospital?.id}/reset-lists`, {});
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate anesthesia settings to refresh the lists
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/settings/${activeHospital?.id}`] });
      setResetListsDialogOpen(false);
      setResetListsConfirmText("");
      
      toast({ 
        title: "Lists reset successfully", 
        description: "Allergies, medications, and checklists have been reset to defaults.",
      });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to reset lists", variant: "destructive" });
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

  const handleDuplicateTemplate = (template: any) => {
    setEditingTemplate(null); // Clear editing template so it creates a new one
    setTemplateForm({
      name: `${template.name} (${t("common.copy")})`,
      recurrency: template.recurrency,
      items: (template.items || []).map((item: any) => typeof item === 'string' ? item : (item.description || "")),
      unitId: template.unitId || "",
      role: template.role || "",
      startDate: new Date().toISOString().split('T')[0], // Reset start date to today
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

      {/* Module Configuration Info Card */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <i className="fas fa-info-circle text-xl text-primary mt-0.5"></i>
          <div>
            <h3 className="font-semibold text-foreground text-lg mb-2">
              Module Configuration
            </h3>
            <p className="text-sm text-muted-foreground mb-2">
              Anesthesia and Surgery modules are now configured per-unit in the Units tab.
            </p>
            <p className="text-sm text-muted-foreground">
              Edit a unit and enable the "Anesthesia Module" or "Surgery Module" checkbox to configure which units support these features.
            </p>
          </div>
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

      {/* Reset Lists Card */}
      <div className="bg-card border border-destructive/30 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg">
              <i className="fas fa-rotate-right mr-2 text-destructive"></i>
              Reset Lists
            </h3>
            <p className="text-sm text-muted-foreground">
              Reset allergies, medications, and checklists to default values
            </p>
            <p className="text-xs text-destructive mt-1">
              <i className="fas fa-exclamation-triangle mr-1"></i>
              Warning: This will replace all customizations with defaults
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setResetListsDialogOpen(true)}
            disabled={resetListsMutation.isPending}
            data-testid="button-reset-lists"
          >
            {resetListsMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Resetting...
              </>
            ) : (
              <>
                <i className="fas fa-rotate-right mr-2"></i>
                Reset Lists
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
        <button
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "suppliers"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          onClick={() => setActiveTab("suppliers")}
          data-testid="tab-suppliers"
        >
          <i className="fas fa-truck mr-2"></i>
          Suppliers
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
      )}

      {/* Suppliers Tab Content */}
      {activeTab === "suppliers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">Supplier Price Sync</h2>
            <Button 
              onClick={() => setSupplierDialogOpen(true)} 
              size="sm" 
              data-testid="button-add-supplier"
            >
              <i className="fas fa-plus mr-2"></i>
              Add Supplier
            </Button>
          </div>

          {/* Info Card */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Automatic Price Updates
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Connect your supplier accounts to automatically sync current prices for your inventory items.
                  Supports Galexis (XML API) and Polymed (browser automation) with customer-specific pricing.
                </p>
              </div>
            </div>
          </div>

          {catalogsLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
            </div>
          ) : supplierCatalogs.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-truck text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Suppliers Configured</h3>
              <p className="text-muted-foreground mb-4">
                Add a supplier to enable automatic price syncing
              </p>
              <Button onClick={() => setSupplierDialogOpen(true)} size="sm">
                <i className="fas fa-plus mr-2"></i>
                Add Supplier
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {supplierCatalogs.map((catalog: any) => {
                const latestJob = priceSyncJobs.find((j: any) => j.catalogId === catalog.id);
                const isJobActive = latestJob && (latestJob.status === 'queued' || latestJob.status === 'processing');
                
                return (
                  <div key={catalog.id} className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{catalog.supplierName}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            catalog.supplierType === 'browser'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          }`}>
                            {catalog.supplierType === 'browser' ? 'Browser' : 'API'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            catalog.isEnabled 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {catalog.isEnabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        {catalog.supplierType === 'browser' ? (
                          <>
                            <p className="text-sm text-muted-foreground mt-1">
                              <i className="fas fa-globe mr-1"></i>
                              Account: {catalog.browserUsername || 'Not configured'}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground mt-1">
                            Customer #: {catalog.customerNumber || 'Not configured'}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          Password: {catalog.apiPasswordEncrypted ? (
                            <span className="text-green-600 dark:text-green-400">
                              <i className="fas fa-check-circle mr-1"></i>Configured
                            </span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">
                              <i className="fas fa-times-circle mr-1"></i>Not set
                            </span>
                          )}
                        </p>
                        {catalog.lastSyncAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last sync: {new Date(catalog.lastSyncAt).toLocaleString()} - {catalog.lastSyncMessage || catalog.lastSyncStatus}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerSyncMutation.mutate(catalog.id)}
                          disabled={isJobActive || triggerSyncMutation.isPending}
                          data-testid={`button-sync-${catalog.id}`}
                        >
                          {isJobActive ? (
                            <>
                              <i className="fas fa-spinner fa-spin mr-2"></i>
                              {latestJob.progressPercent || 0}%
                            </>
                          ) : (
                            <>
                              <i className="fas fa-sync mr-2"></i>
                              Sync Prices
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this supplier configuration?')) {
                              deleteCatalogMutation.mutate(catalog.id);
                            }
                          }}
                          data-testid={`button-delete-supplier-${catalog.id}`}
                        >
                          <i className="fas fa-trash text-destructive"></i>
                        </Button>
                      </div>
                    </div>
                    
                    {/* Show latest job status if active */}
                    {isJobActive && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-primary h-full transition-all duration-300"
                              style={{ width: `${latestJob.progressPercent || 0}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {latestJob.status === 'queued' ? 'Waiting...' : 
                             latestJob.processedItems ? `${latestJob.processedItems}/${latestJob.totalItems || '?'} items` : 'Processing...'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Sync Jobs */}
          {priceSyncJobs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-md font-semibold text-foreground mb-3">Recent Sync Jobs</h3>
              <div className="space-y-2">
                {priceSyncJobs.slice(0, 5).map((job: any) => (
                  <div key={job.id} className="bg-muted/50 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          job.status === 'completed' ? 'bg-green-500' :
                          job.status === 'failed' ? 'bg-red-500' :
                          job.status === 'processing' ? 'bg-yellow-500 animate-pulse' :
                          'bg-gray-400'
                        }`} />
                        <span className="font-medium capitalize">{job.status}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {job.status === 'completed' && job.summary && (
                      <div className="text-muted-foreground mt-1 text-xs space-y-1">
                        {(() => {
                          try {
                            const s = JSON.parse(job.summary);
                            return (
                              <>
                                <p className="text-green-600 dark:text-green-400 font-medium">
                                  Matched {s.matchedItems} items, updated {s.updatedItems} prices
                                </p>
                                {s.itemsWithGtinNoSupplierCode > 0 && (
                                  <p className="text-amber-600 dark:text-amber-400">
                                    {s.itemsWithGtinNoSupplierCode} items have GTIN but no Galexis code
                                  </p>
                                )}
                                {s.itemsWithoutSupplierCode > 0 && (
                                  <p className="text-muted-foreground">
                                    {s.totalItemsInHospital} total items, {s.itemsWithSupplierCode} with Galexis codes configured
                                  </p>
                                )}
                              </>
                            );
                          } catch { return <p>{job.summary}</p>; }
                        })()}
                      </div>
                    )}
                    {job.status === 'failed' && job.error && (
                      <p className="text-red-500 mt-1">{job.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="supplier-name">Supplier</Label>
              <Select
                value={supplierForm.supplierName}
                onValueChange={(value) => {
                  const isPolymed = value === "Polymed";
                  setSupplierForm({ 
                    ...supplierForm, 
                    supplierName: value,
                    supplierType: isPolymed ? "browser" : "api",
                    browserLoginUrl: isPolymed ? "https://shop.polymed.ch/de" : "",
                  });
                }}
              >
                <SelectTrigger data-testid="select-supplier-name">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Galexis">Galexis (API)</SelectItem>
                  <SelectItem value="Polymed">Polymed (Browser)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {supplierForm.supplierType === "api" ? (
              <>
                <div>
                  <Label htmlFor="customer-number">Customer Number *</Label>
                  <Input
                    id="customer-number"
                    value={supplierForm.customerNumber}
                    onChange={(e) => setSupplierForm({ ...supplierForm, customerNumber: e.target.value })}
                    placeholder="Your Galexis customer number"
                    data-testid="input-customer-number"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This is the customer number provided by Galexis for API access
                  </p>
                </div>
                <div>
                  <Label htmlFor="api-password">API Password *</Label>
                  <Input
                    id="api-password"
                    type="password"
                    value={supplierForm.apiPassword}
                    onChange={(e) => setSupplierForm({ ...supplierForm, apiPassword: e.target.value })}
                    placeholder="Enter Galexis API password"
                    data-testid="input-api-password"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    <i className="fas fa-lock mr-1"></i>
                    Stored securely with encryption. Cannot be viewed after saving.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <i className="fas fa-globe mr-2"></i>
                    Polymed uses browser automation to access your account and retrieve prices. Your credentials are encrypted and stored securely.
                  </p>
                </div>
                <div>
                  <Label htmlFor="browser-username">Account Email *</Label>
                  <Input
                    id="browser-username"
                    type="email"
                    value={supplierForm.browserUsername}
                    onChange={(e) => setSupplierForm({ ...supplierForm, browserUsername: e.target.value })}
                    placeholder="Your Polymed account email"
                    data-testid="input-browser-username"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The email address you use to log into shop.polymed.ch
                  </p>
                </div>
                <div>
                  <Label htmlFor="browser-password">Account Password *</Label>
                  <Input
                    id="browser-password"
                    type="password"
                    value={supplierForm.apiPassword}
                    onChange={(e) => setSupplierForm({ ...supplierForm, apiPassword: e.target.value })}
                    placeholder="Enter Polymed account password"
                    data-testid="input-browser-password"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    <i className="fas fa-lock mr-1"></i>
                    Stored securely with encryption. Cannot be viewed after saving.
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (supplierForm.supplierType === "api") {
                    if (!supplierForm.customerNumber.trim()) {
                      toast({ title: t("common.error"), description: "Customer number is required", variant: "destructive" });
                      return;
                    }
                  } else {
                    if (!supplierForm.browserUsername.trim()) {
                      toast({ title: t("common.error"), description: "Account email is required", variant: "destructive" });
                      return;
                    }
                  }
                  if (!supplierForm.apiPassword.trim()) {
                    toast({ title: t("common.error"), description: "Password is required", variant: "destructive" });
                    return;
                  }
                  createCatalogMutation.mutate(supplierForm);
                }}
                disabled={createCatalogMutation.isPending}
                data-testid="button-save-supplier"
              >
                Add Supplier
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                    {templateForm.startDate ? formatDateLong(templateForm.startDate) : t("admin.selectDate")}
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

      {/* Seed Hospital Confirmation Dialog */}
      <AlertDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
        <AlertDialogContent data-testid="dialog-seed-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Seed Hospital with Default Data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will add the following default data to your hospital:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>4 Units:</strong> Anesthesia, OR, ER, ICU</li>
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

      {/* Reset Lists Confirmation Dialog - Double Confirm */}
      <AlertDialog open={resetListsDialogOpen} onOpenChange={(open) => {
        setResetListsDialogOpen(open);
        if (!open) setResetListsConfirmText("");
      }}>
        <AlertDialogContent data-testid="dialog-reset-lists-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              Reset Lists to Defaults?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-destructive">This is a destructive action that cannot be undone!</p>
              <p>This will <strong>replace</strong> the following with default values:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>Allergies:</strong> 9 common allergies (Penicillin, Latex, etc.)</li>
                <li><strong>Anticoagulation medications:</strong> 6 items (Aspirin, Warfarin, etc.)</li>
                <li><strong>General medications:</strong> 8 items (Metformin, Insulin, etc.)</li>
                <li><strong>WHO Checklists:</strong> Sign-In, Time-Out, and Sign-Out items</li>
              </ul>
              <p className="text-sm mt-3">
                <strong>Medical History will NOT be affected.</strong>
              </p>
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                <Label htmlFor="confirm-reset" className="text-sm font-medium">
                  Type <span className="font-mono bg-muted px-1 rounded">RESET</span> to confirm:
                </Label>
                <Input
                  id="confirm-reset"
                  value={resetListsConfirmText}
                  onChange={(e) => setResetListsConfirmText(e.target.value)}
                  placeholder="Type RESET to confirm"
                  className="mt-2"
                  data-testid="input-confirm-reset"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset-lists">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => resetListsMutation.mutate()}
              disabled={resetListsMutation.isPending || resetListsConfirmText !== "RESET"}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-reset-lists"
            >
              {resetListsMutation.isPending ? "Resetting..." : "Reset Lists"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
