import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Syringe, Stethoscope, Briefcase, Copy, Check, Link as LinkIcon, RefreshCw, Trash2, Eye, EyeOff, Settings, ExternalLink, Plus, MessageSquare, FileText, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { formatDateLong } from "@/lib/dateUtils";
import type { Unit } from "@shared/schema";

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

export default function Hospital() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Internal tab state
  const [activeTab, setActiveTab] = useState<"settings" | "data" | "units" | "rooms" | "checklists" | "suppliers" | "integrations">("settings");
  
  // Rooms management state
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [roomFormName, setRoomFormName] = useState('');
  const [roomFormType, setRoomFormType] = useState<'OP' | 'PACU'>('OP');
  

  // Supplier catalog states
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplierName: "Galexis",
    supplierType: "api" as "api" | "database",
    customerNumber: "",
    apiPassword: "",
  });

  // HIN Database sync state - track if syncing for faster polling
  const [hinIsSyncing, setHinIsSyncing] = useState(false);
  const { data: hinStatus, isLoading: hinStatusLoading, refetch: refetchHinStatus } = useQuery<{
    articlesCount: number;
    lastSyncAt: string | null;
    status: string;
    errorMessage?: string;
    syncDurationMs?: number;
    processedItems?: number;
    totalItems?: number;
  }>({
    queryKey: ['/api/hin/status'],
    enabled: activeTab === 'suppliers',
    refetchInterval: hinIsSyncing ? 3000 : 30000, // Poll faster during sync
  });
  
  // Update syncing state when status changes
  useEffect(() => {
    if (hinStatus?.status === 'syncing') {
      setHinIsSyncing(true);
    } else if (hinIsSyncing && hinStatus?.status !== 'syncing') {
      setHinIsSyncing(false);
    }
  }, [hinStatus?.status, hinIsSyncing]);

  const hinSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/hin/sync");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: "HIN sync started in background" });
      setTimeout(() => refetchHinStatus(), 3000);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to start HIN sync", variant: "destructive" });
    },
  });
  
  // Galexis debug test state
  const [galexisDebugQuery, setGalexisDebugQuery] = useState("");
  const [galexisDebugResult, setGalexisDebugResult] = useState<any>(null);
  const [galexisDebugLoading, setGalexisDebugLoading] = useState(false);

  // HIN debug test state
  const [hinDebugQuery, setHinDebugQuery] = useState("");
  const [hinDebugResult, setHinDebugResult] = useState<any>(null);
  const [hinDebugLoading, setHinDebugLoading] = useState(false);

  const hinResetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/hin/reset-status");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: "HIN sync status reset" });
      refetchHinStatus();
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const handleHinLookup = async () => {
    if (!hinDebugQuery.trim()) return;
    setHinDebugLoading(true);
    setHinDebugResult(null);
    try {
      const response = await apiRequest("POST", "/api/hin/lookup", { code: hinDebugQuery.trim() });
      const result = await response.json();
      setHinDebugResult(result);
    } catch (error: any) {
      setHinDebugResult({ error: error.message });
    } finally {
      setHinDebugLoading(false);
    }
  };

  // Hospital company data states
  const [hospitalDialogOpen, setHospitalDialogOpen] = useState(false);
  const [hospitalForm, setHospitalForm] = useState({
    name: activeHospital?.name || "",
    companyName: "",
    companyStreet: "",
    companyPostalCode: "",
    companyCity: "",
    companyPhone: "",
    companyEmail: "",
    companyLogoUrl: "",
    runwayTargetDays: 14,
    runwayWarningDays: 7,
    runwayLookbackDays: 30,
    questionnaireDisabled: false,
    preSurgeryReminderDisabled: false,
  });
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

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

  // Fetch surgery rooms
  type SurgeryRoom = { id: string; name: string; type: 'OP' | 'PACU'; hospitalId: string; sortOrder: number; createdAt: string };
  const { data: surgeryRooms = [], isLoading: roomsLoading } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
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

  // Questionnaire token query
  const { data: questionnaireTokenData } = useQuery<{ questionnaireToken: string | null }>({
    queryKey: [`/api/admin/${activeHospital?.id}/questionnaire-token`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // External surgery token query
  const { data: externalSurgeryTokenData } = useQuery<{ token: string | null }>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/external-surgery-token`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Questionnaire link state
  const [linkCopied, setLinkCopied] = useState(false);
  const [externalSurgeryLinkCopied, setExternalSurgeryLinkCopied] = useState(false);

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
      // Invalidate all checklist-related queries for this hospital (covers all units)
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
      // Invalidate all checklist-related queries for this hospital (covers all units)
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
      // Invalidate all checklist-related queries for this hospital (covers all units)
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

  // Questionnaire token mutations
  const generateQuestionnaireTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/questionnaire-token/generate`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/questionnaire-token`] });
      toast({ title: t("common.success"), description: "Questionnaire link generated" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to generate link", variant: "destructive" });
    },
  });

  const deleteQuestionnaireTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/${activeHospital?.id}/questionnaire-token`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/questionnaire-token`] });
      toast({ title: t("common.success"), description: "Questionnaire link disabled" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to disable link", variant: "destructive" });
    },
  });

  // External surgery token mutations
  const generateExternalSurgeryTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/hospitals/${activeHospital?.id}/external-surgery-token`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${activeHospital?.id}/external-surgery-token`] });
      toast({ title: t("common.success"), description: t("admin.externalSurgeryLinkGenerated", "External surgery booking link generated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to generate link", variant: "destructive" });
    },
  });

  const deleteExternalSurgeryTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/hospitals/${activeHospital?.id}/external-surgery-token`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${activeHospital?.id}/external-surgery-token`] });
      toast({ title: t("common.success"), description: t("admin.externalSurgeryLinkDisabled", "External surgery booking link disabled") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to disable link", variant: "destructive" });
    },
  });

  // Helper function to get the questionnaire URL
  const getQuestionnaireUrl = () => {
    if (!questionnaireTokenData?.questionnaireToken) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/questionnaire/hospital/${questionnaireTokenData.questionnaireToken}`;
  };

  // Helper function to get the external surgery booking URL
  const getExternalSurgeryUrl = () => {
    if (!externalSurgeryTokenData?.token) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/external-surgery/${externalSurgeryTokenData.token}`;
  };

  const handleCopyExternalSurgeryLink = async () => {
    const url = getExternalSurgeryUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setExternalSurgeryLinkCopied(true);
        toast({ title: t("common.success"), description: t("admin.linkCopied", "Link copied to clipboard") });
        setTimeout(() => setExternalSurgeryLinkCopied(false), 2000);
      } catch (err) {
        toast({ title: t("common.error"), description: t("admin.failedToCopy", "Failed to copy link"), variant: "destructive" });
      }
    }
  };

  const handleCopyLink = async () => {
    const url = getQuestionnaireUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast({ title: t("common.success"), description: "Link copied to clipboard" });
    }
  };

  // Fetch full hospital data (for settings tab or dialog)
  const { data: fullHospitalData } = useQuery<any>({
    queryKey: [`/api/admin/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin && (hospitalDialogOpen || activeTab === "settings" || activeTab === "data"),
  });

  // Initialize form when hospital data is loaded
  useEffect(() => {
    if (fullHospitalData && (hospitalDialogOpen || activeTab === "settings" || activeTab === "data")) {
      setHospitalForm({
        name: fullHospitalData.name || "",
        companyName: fullHospitalData.companyName || "",
        companyStreet: fullHospitalData.companyStreet || "",
        companyPostalCode: fullHospitalData.companyPostalCode || "",
        companyCity: fullHospitalData.companyCity || "",
        companyPhone: fullHospitalData.companyPhone || "",
        companyEmail: fullHospitalData.companyEmail || "",
        companyLogoUrl: fullHospitalData.companyLogoUrl || "",
        runwayTargetDays: fullHospitalData.runwayTargetDays ?? 14,
        runwayWarningDays: fullHospitalData.runwayWarningDays ?? 7,
        runwayLookbackDays: fullHospitalData.runwayLookbackDays ?? 30,
        questionnaireDisabled: fullHospitalData.questionnaireDisabled ?? false,
        preSurgeryReminderDisabled: fullHospitalData.preSurgeryReminderDisabled ?? false,
      });
    }
  }, [fullHospitalData, hospitalDialogOpen, activeTab]);

  // Hospital mutation
  const updateHospitalMutation = useMutation({
    mutationFn: async (data: typeof hospitalForm) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      setHospitalDialogOpen(false);
      toast({ title: t("common.success"), description: t("admin.hospitalDataUpdatedSuccess") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateHospital"), variant: "destructive" });
    },
  });

  // Update questionnaire disabled mutation (for quick toggle)
  const updateQuestionnaireDisabledMutation = useMutation({
    mutationFn: async (disabled: boolean) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { questionnaireDisabled: disabled });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ 
        title: t("common.success"), 
        description: hospitalForm.questionnaireDisabled 
          ? t("admin.questionnaireDisabled", "Questionnaire function disabled")
          : t("admin.questionnaireEnabledSuccess", "Questionnaire function enabled")
      });
    },
    onError: (error: any) => {
      // Revert local state on error
      setHospitalForm(prev => ({ ...prev, questionnaireDisabled: !prev.questionnaireDisabled }));
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateHospital"), variant: "destructive" });
    },
  });

  // Update pre-surgery reminder disabled mutation (for quick toggle)
  const updatePreSurgeryReminderDisabledMutation = useMutation({
    mutationFn: async (disabled: boolean) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { preSurgeryReminderDisabled: disabled });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ 
        title: t("common.success"), 
        description: hospitalForm.preSurgeryReminderDisabled 
          ? t("admin.preSurgeryReminderDisabled", "Pre-surgery reminder disabled")
          : t("admin.preSurgeryReminderEnabledSuccess", "Pre-surgery reminder enabled")
      });
    },
    onError: (error: any) => {
      // Revert local state on error
      setHospitalForm(prev => ({ ...prev, preSurgeryReminderDisabled: !prev.preSurgeryReminderDisabled }));
      toast({ title: t("common.error"), description: error.message || t("admin.failedToUpdateHospital"), variant: "destructive" });
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

    // Type is the single source of truth
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
    setHospitalDialogOpen(true);
  };

  const handleSaveHospital = () => {
    if (!hospitalForm.name.trim()) {
      toast({ title: t("common.error"), description: t("admin.hospitalNameRequired"), variant: "destructive" });
      return;
    }
    updateHospitalMutation.mutate(hospitalForm);
  };

  // Compress image for logo upload
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const maxSize = 400;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("common.error"), description: t("admin.logoTooLarge"), variant: "destructive" });
      return;
    }
    
    setIsUploadingLogo(true);
    try {
      const compressedImage = await compressImage(file);
      setHospitalForm(prev => ({ ...prev, companyLogoUrl: compressedImage }));
    } catch (error) {
      toast({ title: t("common.error"), description: t("admin.failedToUploadLogo"), variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
    }
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

      {/* Menu Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-0 overflow-x-auto" aria-label="Tabs">
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "settings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("settings")}
            data-testid="tab-settings"
          >
            <Settings className="h-4 w-4 mr-2 inline" />
            {t("admin.generalSettings", "General Settings")}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "data"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("data")}
            data-testid="tab-data"
          >
            <i className="fas fa-database mr-2"></i>
            {t("admin.dataAndLinks", "Data & Links")}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "units"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("units")}
            data-testid="tab-units"
          >
            <i className="fas fa-location-dot mr-2"></i>
            {t("admin.units")}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "rooms"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("rooms")}
            data-testid="tab-rooms"
          >
            <i className="fas fa-door-open mr-2"></i>
            {t("admin.rooms", "Rooms")}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "checklists"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("checklists")}
            data-testid="tab-checklists"
          >
            <i className="fas fa-clipboard-check mr-2"></i>
            {t("admin.checklists")}
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "suppliers"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("suppliers")}
            data-testid="tab-suppliers"
          >
            <i className="fas fa-truck mr-2"></i>
            Suppliers
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "integrations"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
            onClick={() => setActiveTab("integrations")}
            data-testid="tab-integrations"
          >
            <Settings className="h-4 w-4 mr-2 inline" />
            {t("admin.integrations", "Integrations")}
          </button>
        </nav>
      </div>

      {/* General Settings Tab Content */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Company Settings Section */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <i className="fas fa-building text-primary"></i>
              {t("admin.companySettings", "Company Settings")}
            </h2>
            
            <div className="space-y-6">
              {/* Hospital Name (System name) - First Field */}
              <div>
                <Label htmlFor="hospital-name-inline">{t("admin.hospitalNameLabel")} *</Label>
                <Input
                  id="hospital-name-inline"
                  value={hospitalForm.name}
                  onChange={(e) => setHospitalForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t("admin.hospitalNamePlaceholder")}
                  data-testid="input-hospital-name-inline"
                />
                <p className="text-xs text-muted-foreground mt-1">{t("admin.hospitalNameHint")}</p>
              </div>

              {/* Logo Section */}
              <div className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
                    {hospitalForm.companyLogoUrl ? (
                      <img 
                        src={hospitalForm.companyLogoUrl} 
                        alt="Company Logo" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <i className="fas fa-building text-4xl text-muted-foreground"></i>
                    )}
                  </div>
                  <div className="mt-2">
                    <label htmlFor="logo-upload-inline" className="cursor-pointer">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        disabled={isUploadingLogo}
                        asChild
                      >
                        <span>
                          <i className="fas fa-upload mr-2"></i>
                          {isUploadingLogo ? t("common.loading") : t("admin.uploadLogo")}
                        </span>
                      </Button>
                      <input
                        id="logo-upload-inline"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                        data-testid="input-logo-upload-inline"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground mt-1 text-center">{t("admin.logoMaxSize")}</p>
                  </div>
                </div>

                {/* Company Data Section */}
                <div className="flex-1 space-y-4">
                  <div>
                    <Label htmlFor="company-name-inline">{t("admin.companyName")} *</Label>
                    <Input
                      id="company-name-inline"
                      value={hospitalForm.companyName}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, companyName: e.target.value }))}
                      placeholder={t("admin.companyNamePlaceholder")}
                      data-testid="input-company-name-inline"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="company-street-inline">{t("admin.companyStreet")}</Label>
                    <Input
                      id="company-street-inline"
                      value={hospitalForm.companyStreet}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, companyStreet: e.target.value }))}
                      placeholder={t("admin.companyStreetPlaceholder")}
                      data-testid="input-company-street-inline"
                    />
                  </div>

                  {/* Postal Code and City on same row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="company-postal-code-inline">{t("admin.companyPostalCode")}</Label>
                      <Input
                        id="company-postal-code-inline"
                        value={hospitalForm.companyPostalCode}
                        onChange={(e) => setHospitalForm(prev => ({ ...prev, companyPostalCode: e.target.value }))}
                        placeholder="8000"
                        data-testid="input-company-postal-code-inline"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="company-city-inline">{t("admin.companyCity")}</Label>
                      <Input
                        id="company-city-inline"
                        value={hospitalForm.companyCity}
                        onChange={(e) => setHospitalForm(prev => ({ ...prev, companyCity: e.target.value }))}
                        placeholder={t("admin.companyCityPlaceholder")}
                        data-testid="input-company-city-inline"
                      />
                    </div>
                  </div>

                  {/* Phone and Email on same row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="company-phone-inline">{t("admin.companyPhone")}</Label>
                      <PhoneInputWithCountry
                        id="company-phone-inline"
                        value={hospitalForm.companyPhone}
                        onChange={(value) => setHospitalForm(prev => ({ ...prev, companyPhone: value }))}
                        placeholder="44 123 45 67"
                        data-testid="input-company-phone-inline"
                      />
                    </div>
                    <div>
                      <Label htmlFor="company-email-inline">{t("admin.companyEmail")}</Label>
                      <Input
                        id="company-email-inline"
                        type="email"
                        value={hospitalForm.companyEmail}
                        onChange={(e) => setHospitalForm(prev => ({ ...prev, companyEmail: e.target.value }))}
                        placeholder="info@klinik.ch"
                        data-testid="input-company-email-inline"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Runway Alert Configuration */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <i className="fas fa-chart-line text-primary"></i>
                  {t("admin.runwayConfigTitle")}
                </h4>
                <p className="text-sm text-muted-foreground mb-4">{t("admin.runwayConfigDescription")}</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="runway-target-inline">{t("admin.runwayTargetDays")}</Label>
                    <Input
                      id="runway-target-inline"
                      type="number"
                      min={1}
                      max={365}
                      value={hospitalForm.runwayTargetDays}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, runwayTargetDays: parseInt(e.target.value) || 14 }))}
                      data-testid="input-runway-target-inline"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.runwayTargetHint")}</p>
                  </div>
                  <div>
                    <Label htmlFor="runway-warning-inline">{t("admin.runwayWarningDays")}</Label>
                    <Input
                      id="runway-warning-inline"
                      type="number"
                      min={1}
                      max={365}
                      value={hospitalForm.runwayWarningDays}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, runwayWarningDays: parseInt(e.target.value) || 7 }))}
                      data-testid="input-runway-warning-inline"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.runwayWarningHint")}</p>
                  </div>
                  <div>
                    <Label htmlFor="runway-lookback-inline">{t("admin.runwayLookbackDays")}</Label>
                    <Input
                      id="runway-lookback-inline"
                      type="number"
                      min={7}
                      max={365}
                      value={hospitalForm.runwayLookbackDays}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, runwayLookbackDays: parseInt(e.target.value) || 30 }))}
                      data-testid="input-runway-lookback-inline"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.runwayLookbackHint")}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveHospital}
                  disabled={updateHospitalMutation.isPending || isUploadingLogo}
                  data-testid="button-save-hospital-inline"
                >
                  <i className="fas fa-save mr-2"></i>
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Data & Links Tab Content */}
      {activeTab === "data" && (
        <div className="space-y-4">
          {/* Open Questionnaire Link Section */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                    <LinkIcon className="h-5 w-5 text-primary" />
                    {t("admin.openQuestionnaireLink", "Open Questionnaire Link")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.openQuestionnaireLinkDescription", "Public link for patients to fill out pre-operative questionnaires without being pre-registered")}
                  </p>
                </div>
              </div>
              
              {/* Questionnaire Enable/Disable Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">
                    {t("admin.questionnaireEnabled", "Questionnaire Function Enabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("admin.questionnaireEnabledDescription", "When disabled, questionnaire links will not be shown and automatic messages will not be sent")}
                  </p>
                </div>
                <Switch
                  checked={!hospitalForm.questionnaireDisabled}
                  onCheckedChange={(checked) => {
                    setHospitalForm(prev => ({ ...prev, questionnaireDisabled: !checked }));
                    updateQuestionnaireDisabledMutation.mutate(!checked);
                  }}
                  disabled={updateQuestionnaireDisabledMutation.isPending}
                  data-testid="switch-questionnaire-enabled"
                />
              </div>
              
              {!hospitalForm.questionnaireDisabled && (
                <>
                  {questionnaireTokenData?.questionnaireToken ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <Input
                          value={getQuestionnaireUrl() || ""}
                          readOnly
                          className="flex-1 bg-background text-sm font-mono"
                          data-testid="input-questionnaire-url-inline"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyLink}
                          data-testid="button-copy-questionnaire-link-inline"
                        >
                          {linkCopied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateQuestionnaireTokenMutation.mutate()}
                          disabled={generateQuestionnaireTokenMutation.isPending}
                          data-testid="button-regenerate-questionnaire-link-inline"
                        >
                          {generateQuestionnaireTokenMutation.isPending ? (
                            <i className="fas fa-spinner fa-spin mr-2"></i>
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          {t("admin.regenerateLink", "Regenerate Link")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/50 hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(t("admin.disableLinkConfirm", "Are you sure you want to disable this link? Patients won't be able to access the form."))) {
                              deleteQuestionnaireTokenMutation.mutate();
                            }
                          }}
                          disabled={deleteQuestionnaireTokenMutation.isPending}
                          data-testid="button-disable-questionnaire-link-inline"
                        >
                          {deleteQuestionnaireTokenMutation.isPending ? (
                            <i className="fas fa-spinner fa-spin mr-2"></i>
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          {t("admin.disableLink", "Disable Link")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-muted-foreground">
                        {t("admin.noQuestionnaireLinkGenerated", "No questionnaire link has been generated yet.")}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => generateQuestionnaireTokenMutation.mutate()}
                        disabled={generateQuestionnaireTokenMutation.isPending}
                        data-testid="button-generate-questionnaire-link-inline"
                      >
                        {generateQuestionnaireTokenMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                        ) : (
                          <LinkIcon className="h-4 w-4 mr-2" />
                        )}
                        {t("admin.generateLink", "Generate Link")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Pre-Surgery SMS Reminder Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <i className="fas fa-comment-sms text-orange-500"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">
                    {t("admin.preSurgeryReminderEnabled", "Pre-Surgery SMS Reminder")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.preSurgeryReminderEnabledDescription", "When enabled, patients receive an SMS reminder 24 hours before their surgery")}
                  </p>
                </div>
              </div>
              <Switch
                checked={!hospitalForm.preSurgeryReminderDisabled}
                onCheckedChange={(checked) => {
                  setHospitalForm(prev => ({ ...prev, preSurgeryReminderDisabled: !checked }));
                  updatePreSurgeryReminderDisabledMutation.mutate(!checked);
                }}
                disabled={updatePreSurgeryReminderDisabledMutation.isPending}
                data-testid="switch-pre-surgery-reminder-enabled"
              />
            </div>
          </div>

          {/* External Surgery Booking Link Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center">
                  <i className="fas fa-calendar-plus text-teal-500"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">
                    {t("admin.externalSurgeryBookingLink", "External Surgery Booking Link")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.externalSurgeryBookingDescription", "Public link for external surgeons to request surgery appointments")}
                  </p>
                </div>
              </div>

              {externalSurgeryTokenData?.token ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Input
                      value={getExternalSurgeryUrl() || ""}
                      readOnly
                      className="flex-1 bg-background text-sm font-mono"
                      data-testid="input-external-surgery-url"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyExternalSurgeryLink}
                      data-testid="button-copy-external-surgery-link"
                    >
                      {externalSurgeryLinkCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateExternalSurgeryTokenMutation.mutate()}
                      disabled={generateExternalSurgeryTokenMutation.isPending}
                      data-testid="button-regenerate-external-surgery-link"
                    >
                      {generateExternalSurgeryTokenMutation.isPending ? (
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      {t("admin.regenerateLink", "Regenerate Link")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(t("admin.disableExternalSurgeryLinkConfirm", "Are you sure you want to disable this link? External surgeons won't be able to submit requests."))) {
                          deleteExternalSurgeryTokenMutation.mutate();
                        }
                      }}
                      disabled={deleteExternalSurgeryTokenMutation.isPending}
                      data-testid="button-disable-external-surgery-link"
                    >
                      {deleteExternalSurgeryTokenMutation.isPending ? (
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      {t("admin.disableLink", "Disable Link")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.noExternalSurgeryLinkGenerated", "No external surgery booking link has been generated yet.")}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => generateExternalSurgeryTokenMutation.mutate()}
                    disabled={generateExternalSurgeryTokenMutation.isPending}
                    data-testid="button-generate-external-surgery-link"
                  >
                    {generateExternalSurgeryTokenMutation.isPending ? (
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                    ) : (
                      <LinkIcon className="h-4 w-4 mr-2" />
                    )}
                    {t("admin.generateLink", "Generate Link")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Seed Default Data Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-lg">
                  <i className="fas fa-database mr-2 text-primary"></i>
                  {t("admin.defaultDataSetup", "Default Data Setup")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.defaultDataSetupDescription", "Populate hospital with default units, surgery rooms, administration groups, and medications")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <i className="fas fa-info-circle mr-1"></i>
                  {t("admin.defaultDataSetupNote", "Only adds missing items - never replaces existing data")}
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
                    {t("admin.seeding", "Seeding...")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-seedling mr-2"></i>
                    {t("admin.seedDefaultData", "Seed Default Data")}
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
                  {t("admin.resetLists", "Reset Lists")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.resetListsDescription", "Reset allergies, medications, and checklists to default values")}
                </p>
                <p className="text-xs text-destructive mt-1">
                  <i className="fas fa-exclamation-triangle mr-1"></i>
                  {t("admin.resetListsWarning", "Warning: This will replace all customizations with defaults")}
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
                    {t("admin.resetting", "Resetting...")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-rotate-right mr-2"></i>
                    {t("admin.resetLists", "Reset Lists")}
                  </>
                )}
              </Button>
            </div>
          </div>

        </div>
      )}

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

      {/* Rooms Tab Content */}
      {activeTab === "rooms" && (
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
                  Supports Galexis (XML API) with customer-specific pricing.
                </p>
              </div>
            </div>
          </div>

          {/* HIN Database Card */}
          <div className="bg-card border border-border rounded-lg p-4" data-testid="card-hin-database">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">HIN Database</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    Database
                  </span>
                  {hinStatus && hinStatus.articlesCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <i className="fas fa-check mr-1"></i>Synced
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      <i className="fas fa-exclamation-triangle mr-1"></i>Not Synced
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <i className="fas fa-database mr-1"></i>
                  Swiss medication database from HIN (oddb2xml)
                </p>
                {hinStatusLoading ? (
                  <p className="text-sm text-muted-foreground">
                    <i className="fas fa-spinner fa-spin mr-1"></i>Loading status...
                  </p>
                ) : hinStatus ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Articles: <span className="font-medium">{hinStatus.articlesCount?.toLocaleString() || 0}</span>
                    </p>
                    {hinStatus.lastSyncAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last sync: {new Date(hinStatus.lastSyncAt).toLocaleString()}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Database not initialized
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => hinSyncMutation.mutate()}
                  disabled={hinSyncMutation.isPending || hinStatus?.status === 'syncing'}
                  data-testid="button-hin-sync"
                >
                  {hinSyncMutation.isPending || hinStatus?.status === 'syncing' ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Syncing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-sync mr-2"></i>
                      {hinStatus && hinStatus.articlesCount > 0 ? 'Resync' : 'Initialize'}
                    </>
                  )}
                </Button>
                {hinStatus?.status === 'syncing' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => hinResetMutation.mutate()}
                    disabled={hinResetMutation.isPending}
                    title="Reset stuck sync status"
                    data-testid="button-hin-reset"
                  >
                    <i className="fas fa-undo"></i>
                  </Button>
                )}
              </div>
            </div>
            
            {/* HIN Test Lookup */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="Test lookup (pharmacode or GTIN)..."
                  value={hinDebugQuery}
                  onChange={(e) => setHinDebugQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHinLookup()}
                  className="flex-1"
                  data-testid="input-hin-lookup"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleHinLookup}
                  disabled={hinDebugLoading || !hinDebugQuery.trim()}
                  data-testid="button-hin-lookup"
                >
                  {hinDebugLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                </Button>
              </div>
              {hinDebugResult && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs">
                  {hinDebugResult.error ? (
                    <p className="text-destructive">{hinDebugResult.error}</p>
                  ) : hinDebugResult.found ? (
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{hinDebugResult.article.descriptionDe}</p>
                      <p className="text-muted-foreground">
                        Pharmacode: {hinDebugResult.article.pharmacode || 'N/A'} | 
                        GTIN: {hinDebugResult.article.gtin || 'N/A'}
                      </p>
                      <p className="text-muted-foreground">
                        PEXF: {hinDebugResult.article.pexf?.toFixed(2) || 'N/A'} | 
                        PPUB: {hinDebugResult.article.ppub?.toFixed(2) || 'N/A'}
                      </p>
                      {hinDebugResult.article.packSize && (
                        <p className="text-muted-foreground">Pack Size: {hinDebugResult.article.packSize}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">{hinDebugResult.message}</p>
                  )}
                  <p className="text-muted-foreground/70 mt-2">
                    DB Status: {hinDebugResult.syncStatus?.articlesCount?.toLocaleString() || 0} articles
                  </p>
                </div>
              )}
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
                const isGalexis = catalog.supplierName === 'Galexis';
                
                return (
                  <Fragment key={catalog.id}>
                  <div className="bg-card border border-border rounded-lg p-4">
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

                    {/* Galexis API Test Lookup - only show for Galexis */}
                    {isGalexis && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Test lookup (pharmacode or GTIN)..."
                            value={galexisDebugQuery}
                            onChange={(e) => setGalexisDebugQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && galexisDebugQuery.trim()) {
                                (async () => {
                                  setGalexisDebugLoading(true);
                                  setGalexisDebugResult(null);
                                  try {
                                    const query = galexisDebugQuery.trim();
                                    const isGtin = query.length >= 13;
                                    const response = await apiRequest('POST', '/api/items/galexis-lookup', {
                                      hospitalId: activeHospital?.id,
                                      [isGtin ? 'gtin' : 'pharmacode']: query,
                                      debug: true,
                                    });
                                    const result = await response.json();
                                    setGalexisDebugResult(result);
                                  } catch (error: any) {
                                    setGalexisDebugResult({ error: error.message });
                                  } finally {
                                    setGalexisDebugLoading(false);
                                  }
                                })();
                              }
                            }}
                            className="flex-1"
                            data-testid="input-galexis-lookup"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!galexisDebugQuery.trim()) return;
                              setGalexisDebugLoading(true);
                              setGalexisDebugResult(null);
                              try {
                                const query = galexisDebugQuery.trim();
                                const isGtin = query.length >= 13;
                                const response = await apiRequest('POST', '/api/items/galexis-lookup', {
                                  hospitalId: activeHospital?.id,
                                  [isGtin ? 'gtin' : 'pharmacode']: query,
                                  debug: true,
                                });
                                const result = await response.json();
                                setGalexisDebugResult(result);
                              } catch (error: any) {
                                setGalexisDebugResult({ error: error.message });
                              } finally {
                                setGalexisDebugLoading(false);
                              }
                            }}
                            disabled={galexisDebugLoading || !galexisDebugQuery.trim()}
                            data-testid="button-galexis-lookup"
                          >
                            {galexisDebugLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                          </Button>
                        </div>
                        {galexisDebugResult && (
                          <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs">
                            {galexisDebugResult.error ? (
                              <p className="text-destructive">{galexisDebugResult.error}</p>
                            ) : galexisDebugResult.found ? (
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{galexisDebugResult.name}</p>
                                <p className="text-muted-foreground">
                                  Pharmacode: {galexisDebugResult.pharmacode || 'N/A'} | 
                                  GTIN: {galexisDebugResult.gtin || 'N/A'}
                                </p>
                                <p className="text-muted-foreground">
                                  Your Price: CHF {galexisDebugResult.yourPrice?.toFixed(2) || 'N/A'} | 
                                  Discount: {galexisDebugResult.discountPercent?.toFixed(1) || 0}%
                                </p>
                                {galexisDebugResult.packSize && (
                                  <p className="text-muted-foreground">Pack Size: {galexisDebugResult.packSize}</p>
                                )}
                                <p className="text-muted-foreground">Source: {galexisDebugResult.source}</p>
                              </div>
                            ) : (
                              <p className="text-muted-foreground">{galexisDebugResult.message || 'Not found'}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </Fragment>
                );
              })}
            </div>
          )}

          {/* Recent Sync Jobs */}
          {(priceSyncJobs.length > 0 || (hinStatus && hinStatus.status !== 'never_synced')) && (
            <div className="mt-6">
              <h3 className="text-md font-semibold text-foreground mb-3">Recent Sync Jobs</h3>
              <div className="space-y-2">
                {/* HIN Database Sync Status */}
                {hinStatus && hinStatus.status !== 'never_synced' && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          hinStatus.status === 'success' ? 'bg-green-500' :
                          hinStatus.status === 'error' ? 'bg-red-500' :
                          hinStatus.status === 'syncing' ? 'bg-yellow-500 animate-pulse' :
                          'bg-gray-400'
                        }`} />
                        <span className="font-medium">
                          <i className="fas fa-database mr-1 text-blue-500"></i>
                          HIN Database
                        </span>
                        <span className="capitalize text-muted-foreground">
                          ({hinStatus.status === 'success' ? 'completed' : hinStatus.status})
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {hinStatus.lastSyncAt ? new Date(hinStatus.lastSyncAt).toLocaleString() : 'Never'}
                      </span>
                    </div>
                    {hinStatus.status === 'success' && (
                      <div className="text-muted-foreground mt-1 text-xs">
                        <p className="text-green-600 dark:text-green-400 font-medium">
                          Synced {hinStatus.articlesCount?.toLocaleString() || 0} articles
                          {hinStatus.syncDurationMs && ` in ${(hinStatus.syncDurationMs / 1000).toFixed(1)}s`}
                        </p>
                      </div>
                    )}
                    {hinStatus.status === 'syncing' && (
                      <div className="text-muted-foreground mt-2 text-xs space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-blue-500 h-full transition-all duration-300"
                              style={{ 
                                width: `${hinStatus.totalItems && hinStatus.totalItems > 0 
                                  ? Math.round((hinStatus.processedItems || 0) / hinStatus.totalItems * 100) 
                                  : 0}%` 
                              }}
                            />
                          </div>
                          <span className="text-muted-foreground whitespace-nowrap min-w-[120px] text-right">
                            {hinStatus.processedItems?.toLocaleString() || 0} / {hinStatus.totalItems?.toLocaleString() || '?'} articles
                          </span>
                        </div>
                        <p className="text-yellow-600 dark:text-yellow-400">
                          <i className="fas fa-spinner fa-spin mr-1"></i>
                          {hinStatus.totalItems && hinStatus.totalItems > 0 
                            ? `${Math.round((hinStatus.processedItems || 0) / hinStatus.totalItems * 100)}% complete`
                            : 'Downloading...'}
                        </p>
                      </div>
                    )}
                    {hinStatus.status === 'error' && hinStatus.errorMessage && (
                      <div className="mt-2">
                        <p className="text-red-500 text-sm">{hinStatus.errorMessage}</p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline text-xs">
                            Show Error Details
                          </summary>
                          <pre className="mt-2 p-2 bg-red-950/20 border border-red-500/30 rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap text-red-400">
                            {hinStatus.errorMessage}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Galexis/Supplier Sync Jobs */}
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
                        <span className="font-medium">
                          <i className="fas fa-pills mr-1 text-purple-500"></i>
                          Galexis
                        </span>
                        <span className="capitalize text-muted-foreground">({job.status})</span>
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
                                <div className="flex items-center justify-between">
                                  <p className="text-green-600 dark:text-green-400 font-medium">
                                    Matched {s.matchedItems} items, updated {s.updatedItems} prices
                                  </p>
                                  <Link 
                                    href="/inventory/matches" 
                                    className="text-primary hover:underline flex items-center gap-1"
                                    data-testid={`link-view-matches-${job.id}`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    View Matches
                                  </Link>
                                </div>
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
                                {s.galexisApiDebug && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">
                                      Show API Debug Info
                                    </summary>
                                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                                      {JSON.stringify(s.galexisApiDebug, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </>
                            );
                          } catch { return <p>{job.summary}</p>; }
                        })()}
                      </div>
                    )}
                    {job.status === 'failed' && job.error && (
                      <div className="mt-2">
                        <p className="text-red-500 text-sm">{job.error}</p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline text-xs">
                            Show Error Details
                          </summary>
                          <pre className="mt-2 p-2 bg-red-950/20 border border-red-500/30 rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap text-red-400">
                            {job.error}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Integrations Tab Content */}
      {activeTab === "integrations" && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-foreground">{t("admin.integrations", "Integrations")}</h2>
          
          {/* Calendar Sync Integration Card (Timebutler/ICS) */}
          <TimebutlerSyncCard hospitalId={activeHospital?.id} />

          {/* Cal.com Integration Card (for RetellAI booking) */}
          <CalcomIntegrationCard hospitalId={activeHospital?.id} />

          {/* Vonage SMS Integration Card */}
          <VonageIntegrationCard hospitalId={activeHospital?.id} />
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
                  setSupplierForm({ 
                    ...supplierForm, 
                    supplierName: value,
                    supplierType: "api",
                  });
                }}
              >
                <SelectTrigger data-testid="select-supplier-name">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Galexis">Galexis (API)</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (!supplierForm.customerNumber.trim()) {
                    toast({ title: t("common.error"), description: "Customer number is required", variant: "destructive" });
                    return;
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
                          // Get presigned upload URL
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
                          
                          // Upload directly to S3
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

      {/* Hospital Company Data Dialog */}
      <Dialog open={hospitalDialogOpen} onOpenChange={setHospitalDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.editCompanyData")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Logo Section */}
            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="w-32 h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
                  {hospitalForm.companyLogoUrl ? (
                    <img 
                      src={hospitalForm.companyLogoUrl} 
                      alt="Company Logo" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <i className="fas fa-building text-4xl text-muted-foreground"></i>
                  )}
                </div>
                <div className="mt-2">
                  <label htmlFor="logo-upload" className="cursor-pointer">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      disabled={isUploadingLogo}
                      asChild
                    >
                      <span>
                        <i className="fas fa-upload mr-2"></i>
                        {isUploadingLogo ? t("common.loading") : t("admin.uploadLogo")}
                      </span>
                    </Button>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      data-testid="input-logo-upload"
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 text-center">{t("admin.logoMaxSize")}</p>
                </div>
              </div>

              {/* Company Data Section */}
              <div className="flex-1 space-y-4">
                <div>
                  <Label htmlFor="company-name">{t("admin.companyName")} *</Label>
                  <Input
                    id="company-name"
                    value={hospitalForm.companyName}
                    onChange={(e) => setHospitalForm(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder={t("admin.companyNamePlaceholder")}
                    data-testid="input-company-name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="company-street">{t("admin.companyStreet")}</Label>
                  <Input
                    id="company-street"
                    value={hospitalForm.companyStreet}
                    onChange={(e) => setHospitalForm(prev => ({ ...prev, companyStreet: e.target.value }))}
                    placeholder={t("admin.companyStreetPlaceholder")}
                    data-testid="input-company-street"
                  />
                </div>

                {/* Postal Code and City on same row */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="company-postal-code">{t("admin.companyPostalCode")}</Label>
                    <Input
                      id="company-postal-code"
                      value={hospitalForm.companyPostalCode}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, companyPostalCode: e.target.value }))}
                      placeholder="8000"
                      data-testid="input-company-postal-code"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="company-city">{t("admin.companyCity")}</Label>
                    <Input
                      id="company-city"
                      value={hospitalForm.companyCity}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, companyCity: e.target.value }))}
                      placeholder={t("admin.companyCityPlaceholder")}
                      data-testid="input-company-city"
                    />
                  </div>
                </div>

                {/* Phone and Email on same row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company-phone">{t("admin.companyPhone")}</Label>
                    <PhoneInputWithCountry
                      id="company-phone"
                      value={hospitalForm.companyPhone}
                      onChange={(value) => setHospitalForm(prev => ({ ...prev, companyPhone: value }))}
                      placeholder="44 123 45 67"
                      data-testid="input-company-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="company-email">{t("admin.companyEmail")}</Label>
                    <Input
                      id="company-email"
                      type="email"
                      value={hospitalForm.companyEmail}
                      onChange={(e) => setHospitalForm(prev => ({ ...prev, companyEmail: e.target.value }))}
                      placeholder="info@klinik.ch"
                      data-testid="input-company-email"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Stock Runway Alert Configuration */}
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <i className="fas fa-chart-line text-primary"></i>
                {t("admin.runwayConfigTitle")}
              </h4>
              <p className="text-sm text-muted-foreground mb-4">{t("admin.runwayConfigDescription")}</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="runway-target">{t("admin.runwayTargetDays")}</Label>
                  <Input
                    id="runway-target"
                    type="number"
                    min={1}
                    max={365}
                    value={hospitalForm.runwayTargetDays}
                    onChange={(e) => setHospitalForm(prev => ({ ...prev, runwayTargetDays: parseInt(e.target.value) || 14 }))}
                    data-testid="input-runway-target"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.runwayTargetHint")}</p>
                </div>
                <div>
                  <Label htmlFor="runway-warning">{t("admin.runwayWarningDays")}</Label>
                  <Input
                    id="runway-warning"
                    type="number"
                    min={1}
                    max={365}
                    value={hospitalForm.runwayWarningDays}
                    onChange={(e) => setHospitalForm(prev => ({ ...prev, runwayWarningDays: parseInt(e.target.value) || 7 }))}
                    data-testid="input-runway-warning"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.runwayWarningHint")}</p>
                </div>
                <div>
                  <Label htmlFor="runway-lookback">{t("admin.runwayLookbackDays")}</Label>
                  <Input
                    id="runway-lookback"
                    type="number"
                    min={7}
                    max={365}
                    value={hospitalForm.runwayLookbackDays}
                    onChange={(e) => setHospitalForm(prev => ({ ...prev, runwayLookbackDays: parseInt(e.target.value) || 30 }))}
                    data-testid="input-runway-lookback"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.runwayLookbackHint")}</p>
                </div>
              </div>
            </div>

            {/* Hospital Name (System name) */}
            <div className="pt-4 border-t">
              <Label htmlFor="hospital-name">{t("admin.hospitalNameLabel")} *</Label>
              <Input
                id="hospital-name"
                value={hospitalForm.name}
                onChange={(e) => setHospitalForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t("admin.hospitalNamePlaceholder")}
                data-testid="input-hospital-name"
              />
              <p className="text-xs text-muted-foreground mt-1">{t("admin.hospitalNameHint")}</p>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setHospitalDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSaveHospital}
                disabled={updateHospitalMutation.isPending || isUploadingLogo}
                data-testid="button-save-hospital"
              >
                <i className="fas fa-save mr-2"></i>
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
            <AlertDialogTitle>{t("admin.seedDialogTitle", "Seed Hospital with Default Data?")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t("admin.seedDialogDescription", "This will add the following default data to your hospital:")}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>{t("admin.seedUnits", "4 Units:")}</strong> {t("admin.seedUnitsDetail", "Anesthesia, OR, ER, ICU")}</li>
                <li><strong>{t("admin.seedRooms", "3 Surgery Rooms:")}</strong> OP1, OP2, OP3</li>
                <li><strong>{t("admin.seedGroups", "5 Administration Groups:")}</strong> {t("admin.seedGroupsDetail", "Infusions, Pumps, Bolus, Short IVs, Antibiotics")}</li>
              </ul>
              <p className="text-xs mt-2 text-muted-foreground">
                <i className="fas fa-shield-check mr-1"></i>
                <strong>{t("admin.safeOperation", "Safe operation:")}</strong> {t("admin.safeOperationDetail", "Only adds items that don't already exist. Your existing data will not be modified or deleted.")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-seed">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => seedHospitalMutation.mutate()}
              disabled={seedHospitalMutation.isPending}
              data-testid="button-confirm-seed"
            >
              {seedHospitalMutation.isPending ? t("admin.seeding", "Seeding...") : t("admin.seedDefaultData", "Seed Default Data")}
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
              {t("admin.resetDialogTitle", "Reset Lists to Defaults?")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-destructive">{t("admin.resetDestructiveWarning", "This is a destructive action that cannot be undone!")}</p>
              <p>{t("admin.resetDialogDescription", "This will replace the following with default values:")}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>{t("admin.resetAllergies", "Allergies:")}</strong> {t("admin.resetAllergiesDetail", "9 common allergies (Penicillin, Latex, etc.)")}</li>
                <li><strong>{t("admin.resetAnticoag", "Anticoagulation medications:")}</strong> {t("admin.resetAnticoagDetail", "6 items (Aspirin, Warfarin, etc.)")}</li>
                <li><strong>{t("admin.resetGeneralMeds", "General medications:")}</strong> {t("admin.resetGeneralMedsDetail", "8 items (Metformin, Insulin, etc.)")}</li>
                <li><strong>{t("admin.resetChecklists", "WHO Checklists:")}</strong> {t("admin.resetChecklistsDetail", "Sign-In, Time-Out, and Sign-Out items")}</li>
              </ul>
              <p className="text-sm mt-3">
                <strong>{t("admin.medHistoryNotAffected", "Medical History will NOT be affected.")}</strong>
              </p>
              <div className="mt-4 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                <Label htmlFor="confirm-reset" className="text-sm font-medium">
                  {t("admin.typeResetConfirm", "Type")} <span className="font-mono bg-muted px-1 rounded">RESET</span> {t("admin.toConfirm", "to confirm:")}
                </Label>
                <Input
                  id="confirm-reset"
                  value={resetListsConfirmText}
                  onChange={(e) => setResetListsConfirmText(e.target.value)}
                  placeholder={t("admin.typeResetPlaceholder", "Type RESET to confirm")}
                  className="mt-2"
                  data-testid="input-confirm-reset"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset-lists">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => resetListsMutation.mutate()}
              disabled={resetListsMutation.isPending || resetListsConfirmText !== "RESET"}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-reset-lists"
            >
              {resetListsMutation.isPending ? t("admin.resetting", "Resetting...") : t("admin.resetLists", "Reset Lists")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Timebutler Sync Card Component
function TimebutlerSyncCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  
  // Sync status query
  const { data: syncStatus } = useQuery<{
    timebutler: {
      lastSyncAt: string;
      status: string;
      error?: string | null;
      successCount?: number;
      failedCount?: number;
    } | null;
    calcom: {
      lastSyncAt: string;
      status: string;
      error?: string | null;
      successCount?: number;
      failedCount?: number;
    } | null;
  }>({
    queryKey: [`/api/clinic/${hospitalId}/sync-status`],
    enabled: !!hospitalId,
    refetchInterval: 60000, // Refresh every minute
  });

  const formatLastSync = (lastSyncAt?: string | null) => {
    if (!lastSyncAt) return null;
    const date = new Date(lastSyncAt);
    return date.toLocaleString();
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
          <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{t("admin.calendarSync", "Calendar Sync")}</h3>
          <p className="text-sm text-muted-foreground">{t("admin.calendarSyncDesc", "Sync staff absences from personal calendar URLs (e.g., Timebutler)")}</p>
        </div>
        {/* Sync Status Badge */}
        {syncStatus?.timebutler && (
          <div className="text-right text-xs">
            <div className="flex items-center gap-1 justify-end">
              {syncStatus.timebutler.status === 'completed' ? (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  {t("admin.lastSync", "Last sync")}: {formatLastSync(syncStatus.timebutler.lastSyncAt)}
                </span>
              ) : syncStatus.timebutler.status === 'processing' ? (
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("admin.syncing", "Syncing...")}
                </span>
              ) : syncStatus.timebutler.status === 'failed' ? (
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <i className="fas fa-times-circle text-xs"></i>
                  {t("admin.syncFailed", "Sync failed")}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t("admin.pending", "Pending")}
                </span>
              )}
            </div>
            {syncStatus.timebutler.error && (
              <p className="text-red-500 text-xs mt-1">{syncStatus.timebutler.error}</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-3">
          <p>{t("admin.calendarSyncInfo", "Each staff member can configure their own calendar sync URL in the user menu (top right corner). This approach is simpler and more secure than centralized API access.")}</p>
          
          <h4 className="font-medium">{t("admin.howToSetup", "How staff members set up their sync:")}</h4>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>{t("admin.calendarStep1", "Click on their name in the top right corner")}</li>
            <li>{t("admin.calendarStep2", "Select 'Timebutler Sync'")}</li>
            <li>{t("admin.calendarStep3", "Paste their personal calendar URL from Timebutler")}</li>
            <li>{t("admin.calendarStep4", "Save")}</li>
          </ol>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
          <div className="flex items-center gap-1">
            <i className="fas fa-info-circle"></i>
            <span>{t("admin.calendarSyncNote", "Synced absences appear in the clinic calendar. Manual syncs can be triggered from Clinic → Availability.")}</span>
          </div>
          <span className="text-xs text-muted-foreground">{t("admin.autoSyncInterval", "Auto-sync: every hour")}</span>
        </div>
      </div>
    </div>
  );
}

// Cal.com Integration Card Component
function CalcomIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [calcomApiKey, setCalcomApiKey] = useState("");
  const [calcomEnabled, setCalcomEnabled] = useState(false);
  const [showCalcomApiKey, setShowCalcomApiKey] = useState(false);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingForm, setMappingForm] = useState({
    providerId: "",
    calcomEventTypeId: "",
  });

  // Cal.com config query
  const { data: calcomConfigData, isLoading: calcomLoading } = useQuery<{
    isEnabled?: boolean;
    apiKey?: string;
    lastSyncAt?: string;
    lastSyncError?: string;
  }>({
    queryKey: [`/api/clinic/${hospitalId}/calcom-config`],
    enabled: !!hospitalId,
  });

  // Sync status query (for scheduled job status)
  const { data: syncStatus } = useQuery<{
    timebutler: {
      lastSyncAt: string;
      status: string;
      error?: string | null;
      successCount?: number;
      failedCount?: number;
    } | null;
    calcom: {
      lastSyncAt: string;
      status: string;
      error?: string | null;
      successCount?: number;
      failedCount?: number;
    } | null;
  }>({
    queryKey: [`/api/clinic/${hospitalId}/sync-status`],
    enabled: !!hospitalId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Cal.com provider mappings query
  const { data: calcomMappings = [] } = useQuery<{
    id: string;
    providerId: string;
    calcomEventTypeId: string;
    isEnabled?: boolean;
    lastSyncAt?: string;
    lastSyncError?: string;
  }[]>({
    queryKey: [`/api/clinic/${hospitalId}/calcom-mappings`],
    enabled: !!hospitalId,
  });

  // Providers query for mapping dialog
  const { data: providers = [] } = useQuery<{ id: string; firstName: string; lastName: string }[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/all/providers`],
    enabled: !!hospitalId && mappingDialogOpen,
  });

  // Sync Cal.com state when data is fetched
  useEffect(() => {
    if (calcomConfigData) {
      setCalcomEnabled(calcomConfigData.isEnabled || false);
    }
  }, [calcomConfigData]);

  // Cal.com config mutation
  const saveCalcomConfigMutation = useMutation({
    mutationFn: async (data: { apiKey?: string; isEnabled: boolean }) => {
      const response = await apiRequest("PUT", `/api/clinic/${hospitalId}/calcom-config`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/calcom-config`] });
      toast({ title: t("common.success"), description: "Cal.com configuration saved" });
      setCalcomApiKey("");
      setShowCalcomApiKey(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to save Cal.com configuration", variant: "destructive" });
    },
  });

  // Test Cal.com connection mutation
  const testCalcomMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/calcom-test`);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: t("common.success"), 
        description: `Connected! Found ${data.eventTypes?.length || 0} event types.`,
      });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to connect to Cal.com", variant: "destructive" });
    },
  });

  // Add provider mapping mutation
  const addMappingMutation = useMutation({
    mutationFn: async (data: { providerId: string; calcomEventTypeId: string }) => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/calcom-mappings`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/calcom-mappings`] });
      toast({ title: t("common.success"), description: "Provider mapping added" });
      setMappingDialogOpen(false);
      setMappingForm({ providerId: "", calcomEventTypeId: "" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to add mapping", variant: "destructive" });
    },
  });

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const response = await apiRequest("DELETE", `/api/clinic/${hospitalId}/calcom-mappings/${mappingId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/calcom-mappings`] });
      toast({ title: t("common.success"), description: "Mapping removed" });
    },
  });

  // ICS feeds query for calendar sync
  const { data: feedsData } = useQuery<{
    feedToken: string;
    feeds: Array<{ providerId: string; feedUrl: string; calcomEventTypeId: string }>;
  }>({
    queryKey: [`/api/clinic/${hospitalId}/calcom-feeds`],
    enabled: !!hospitalId && calcomEnabled && calcomMappings.length > 0,
  });

  // Subscribe ICS feeds to Cal.com mutation
  const subscribeFeedsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/calcom-subscribe-feeds`);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: t("common.success"), 
        description: `Subscribed ${data.feedUrls?.length || 0} calendar feed(s) to Cal.com`,
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t("common.error"), 
        description: error.message || "Failed to subscribe feeds to Cal.com", 
        variant: "destructive" 
      });
    },
  });

  if (!hospitalId) return null;

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
              <ExternalLink className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Cal.com (RetellAI)</h3>
              <p className="text-sm text-muted-foreground">Enable phone-based appointment booking via RetellAI voice agents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={calcomEnabled}
              onCheckedChange={(checked) => {
                setCalcomEnabled(checked);
                saveCalcomConfigMutation.mutate({
                  isEnabled: checked,
                });
              }}
              disabled={saveCalcomConfigMutation.isPending}
              data-testid="switch-calcom-enabled"
            />
            <span className={`text-sm ${calcomEnabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {calcomEnabled ? t("common.enabled", "Enabled") : t("common.disabled", "Disabled")}
            </span>
          </div>
        </div>

        {calcomLoading ? (
          <div className="text-center py-4">
            <i className="fas fa-spinner fa-spin text-xl text-primary"></i>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Status */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{t("admin.status", "Status")}:</span>
              {calcomConfigData?.apiKey === '***configured***' ? (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <i className="fas fa-check-circle"></i>
                  API Key configured
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <i className="fas fa-exclamation-triangle"></i>
                  API Key not configured
                </span>
              )}
            </div>

            {/* Scheduled Job Sync Status */}
            {syncStatus?.calcom && (
              <div className="flex items-center gap-2 text-sm">
                {syncStatus.calcom.status === 'completed' ? (
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    {t("admin.lastSync", "Last sync")}: {new Date(syncStatus.calcom.lastSyncAt).toLocaleString()}
                  </span>
                ) : syncStatus.calcom.status === 'processing' ? (
                  <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("admin.syncing", "Syncing...")}
                  </span>
                ) : syncStatus.calcom.status === 'failed' ? (
                  <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                    <i className="fas fa-times-circle text-xs"></i>
                    {t("admin.syncFailed", "Sync failed")}
                    {syncStatus.calcom.error && <span className="text-xs">- {syncStatus.calcom.error}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("admin.pending", "Pending")}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-2">({t("admin.autoSyncInterval", "Auto-sync: every hour")})</span>
              </div>
            )}
            
            {/* Fallback to config lastSyncAt if no scheduled job status */}
            {!syncStatus?.calcom && calcomConfigData?.lastSyncAt && (
              <div className="text-sm text-muted-foreground">
                <span>{t("admin.lastSync", "Last sync")}:</span>{" "}
                <span>{new Date(calcomConfigData.lastSyncAt).toLocaleString()}</span>
                {calcomConfigData.lastSyncError && (
                  <span className="ml-2 text-xs text-red-500">- {calcomConfigData.lastSyncError}</span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">({t("admin.autoSyncInterval", "Auto-sync: every hour")})</span>
              </div>
            )}

            {/* API Key Input */}
            <div className="border-t border-border pt-4">
              <Label htmlFor="calcom-key">Cal.com API Key</Label>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <Input
                    id="calcom-key"
                    type={showCalcomApiKey ? "text" : "password"}
                    value={calcomApiKey}
                    onChange={(e) => setCalcomApiKey(e.target.value)}
                    placeholder={calcomConfigData?.apiKey === '***configured***' ? "••••••••" : "Enter Cal.com API key"}
                    data-testid="input-calcom-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowCalcomApiKey(!showCalcomApiKey)}
                  >
                    {showCalcomApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => testCalcomMutation.mutate()}
                  disabled={testCalcomMutation.isPending}
                  data-testid="button-test-calcom"
                >
                  {testCalcomMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Test
                </Button>
                <Button
                  onClick={() => saveCalcomConfigMutation.mutate({
                    apiKey: calcomApiKey || undefined,
                    isEnabled: calcomEnabled,
                  })}
                  disabled={saveCalcomConfigMutation.isPending}
                  data-testid="button-save-calcom"
                >
                  {saveCalcomConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-save mr-2"></i>}
                  {t("common.save", "Save")}
                </Button>
              </div>
            </div>

            {/* Provider Mappings */}
            {calcomConfigData?.apiKey === '***configured***' && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Provider → Cal.com Event Type Mappings</h4>
                  <Button
                    size="sm"
                    onClick={() => setMappingDialogOpen(true)}
                    data-testid="button-add-calcom-mapping"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Add Mapping
                  </Button>
                </div>
                
                {calcomMappings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No provider mappings configured. Add a mapping to enable booking for specific providers.</p>
                ) : (
                  <div className="space-y-2">
                    {calcomMappings.map((mapping) => (
                      <div key={mapping.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="text-sm">
                          <span className="font-medium">Provider: {mapping.providerId.substring(0, 8)}...</span>
                          <span className="mx-2">→</span>
                          <span>Event Type ID: {mapping.calcomEventTypeId}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMappingMutation.mutate(mapping.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Calendar Sync Section */}
            {calcomMappings.length > 0 && calcomEnabled && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Calendar Sync (Busy Time Blocking)</h4>
                    <p className="text-xs text-muted-foreground">
                      Subscribe your clinic calendar to Cal.com to block booked surgery/appointment times
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => subscribeFeedsMutation.mutate()}
                    disabled={subscribeFeedsMutation.isPending}
                    data-testid="button-subscribe-feeds"
                  >
                    {subscribeFeedsMutation.isPending ? (
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                    ) : (
                      <i className="fas fa-sync mr-2"></i>
                    )}
                    Subscribe to Cal.com
                  </Button>
                </div>
                
                {feedsData?.feeds && feedsData.feeds.length > 0 && (
                  <div className="space-y-2 text-xs">
                    <p className="text-muted-foreground">
                      The following calendar feeds are available for each provider:
                    </p>
                    {feedsData.feeds.map((feed) => {
                      const provider = providers.find(p => p.id === feed.providerId);
                      return (
                        <div key={feed.providerId} className="bg-muted/50 p-2 rounded">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {provider ? `${provider.firstName} ${provider.lastName}` : feed.providerId.substring(0, 8)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(feed.feedUrl);
                                toast({ title: "Copied!", description: "Feed URL copied to clipboard" });
                              }}
                            >
                              <i className="fas fa-copy mr-1"></i>
                              Copy URL
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">How to set up Cal.com + RetellAI booking</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Create a Cal.com account and set up an event type (e.g., "Clinic Appointment")</li>
                <li>Go to Settings → Developer → API Keys and generate a new API key</li>
                <li>Paste the API key here and save</li>
                <li>Add provider mappings to link each doctor to their Cal.com event type</li>
                <li>Click "Subscribe to Cal.com" to sync your clinic calendar (blocks booked times)</li>
                <li>Set up RetellAI with your Cal.com Event Type ID for booking</li>
                <li>Configure a webhook in Cal.com pointing to your app's webhook URL</li>
              </ol>
              <p className="mt-3 text-xs">
                <strong>Webhook URL:</strong>{" "}
                <code className="bg-background px-1 py-0.5 rounded">
                  {window.location.origin}/api/webhooks/calcom/{hospitalId}
                </code>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Add Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Provider Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="mapping-provider">Provider</Label>
              <Select
                value={mappingForm.providerId}
                onValueChange={(value) => setMappingForm({ ...mappingForm, providerId: value })}
              >
                <SelectTrigger data-testid="select-mapping-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mapping-event-type">Cal.com Event Type ID</Label>
              <Input
                id="mapping-event-type"
                value={mappingForm.calcomEventTypeId}
                onChange={(e) => setMappingForm({ ...mappingForm, calcomEventTypeId: e.target.value })}
                placeholder="e.g., 1427703"
                data-testid="input-mapping-event-type"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find this in your Cal.com event type URL: cal.com/username/event-type/<strong>123456</strong>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMappingDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMappingMutation.mutate(mappingForm)}
                disabled={!mappingForm.providerId || !mappingForm.calcomEventTypeId || addMappingMutation.isPending}
              >
                {addMappingMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Add Mapping
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Vonage SMS Integration Card Component
function VonageIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [vonageApiKey, setVonageApiKey] = useState("");
  const [vonageApiSecret, setVonageApiSecret] = useState("");
  const [vonageFromNumber, setVonageFromNumber] = useState("");
  const [vonageEnabled, setVonageEnabled] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [showTestDialog, setShowTestDialog] = useState(false);

  // Vonage config query
  const { data: vonageConfigData, isLoading: vonageLoading } = useQuery<{
    hospitalId: string;
    isEnabled?: boolean;
    hasApiKey?: boolean;
    hasApiSecret?: boolean;
    hasFromNumber?: boolean;
    lastTestedAt?: string;
    lastTestStatus?: string;
    lastTestError?: string;
  }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/vonage`],
    enabled: !!hospitalId,
  });

  // Sync Vonage state when data is fetched
  useEffect(() => {
    if (vonageConfigData) {
      setVonageEnabled(vonageConfigData.isEnabled || false);
    }
  }, [vonageConfigData]);

  // Vonage config mutation
  const saveVonageConfigMutation = useMutation({
    mutationFn: async (data: { apiKey?: string; apiSecret?: string; fromNumber?: string; isEnabled: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/${hospitalId}/integrations/vonage`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/vonage`] });
      toast({ title: t("common.success"), description: "Vonage configuration saved" });
      setVonageApiKey("");
      setVonageApiSecret("");
      setVonageFromNumber("");
      setShowApiKey(false);
      setShowApiSecret(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to save Vonage configuration", variant: "destructive" });
    },
  });

  // Test Vonage connection mutation
  const testVonageMutation = useMutation({
    mutationFn: async (testNumber?: string) => {
      const response = await apiRequest("POST", `/api/admin/${hospitalId}/integrations/vonage/test`, { testPhoneNumber: testNumber });
      return await response.json();
    },
    onSuccess: () => {
      toast({ 
        title: t("common.success"), 
        description: "Test SMS sent successfully! Check your phone.",
      });
      setShowTestDialog(false);
      setTestPhoneNumber("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/vonage`] });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to send test SMS", variant: "destructive" });
    },
  });

  // Delete Vonage config mutation
  const deleteVonageConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/${hospitalId}/integrations/vonage`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/vonage`] });
      toast({ title: t("common.success"), description: "Vonage configuration removed" });
      setVonageEnabled(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to remove Vonage configuration", variant: "destructive" });
    },
  });

  if (!hospitalId) return null;

  const isConfigured = vonageConfigData?.hasApiKey && vonageConfigData?.hasApiSecret && vonageConfigData?.hasFromNumber;

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Vonage SMS</h3>
              <p className="text-sm text-muted-foreground">Send SMS messages to patients using your own Vonage account</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={vonageEnabled}
              onCheckedChange={(checked) => {
                setVonageEnabled(checked);
                saveVonageConfigMutation.mutate({ isEnabled: checked });
              }}
              disabled={saveVonageConfigMutation.isPending || !isConfigured}
              data-testid="switch-vonage-enabled"
            />
            <span className={`text-sm ${vonageEnabled && isConfigured ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {vonageEnabled && isConfigured ? t("common.enabled", "Enabled") : t("common.disabled", "Disabled")}
            </span>
          </div>
        </div>

        {vonageLoading ? (
          <div className="text-center py-4">
            <i className="fas fa-spinner fa-spin text-xl text-primary"></i>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Status */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{t("admin.status", "Status")}:</span>
              {isConfigured ? (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <i className="fas fa-check-circle"></i>
                  Credentials configured
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <i className="fas fa-exclamation-triangle"></i>
                  Credentials not configured
                </span>
              )}
            </div>

            {vonageConfigData?.lastTestedAt && (
              <div className="text-sm text-muted-foreground">
                <span>Last test:</span>{" "}
                <span>{new Date(vonageConfigData.lastTestedAt).toLocaleString()}</span>
                {vonageConfigData.lastTestStatus === 'success' ? (
                  <span className="ml-2 text-green-500">✓ Success</span>
                ) : vonageConfigData.lastTestStatus === 'failed' ? (
                  <span className="ml-2 text-red-500">✗ Failed{vonageConfigData.lastTestError ? `: ${vonageConfigData.lastTestError}` : ''}</span>
                ) : null}
              </div>
            )}

            {/* Credentials Form */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <Label htmlFor="vonage-api-key">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="vonage-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={vonageApiKey}
                    onChange={(e) => setVonageApiKey(e.target.value)}
                    placeholder={vonageConfigData?.hasApiKey ? "••••••••" : "Enter API Key"}
                    data-testid="input-vonage-api-key"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="vonage-api-secret">API Secret</Label>
                <div className="flex gap-2">
                  <Input
                    id="vonage-api-secret"
                    type={showApiSecret ? "text" : "password"}
                    value={vonageApiSecret}
                    onChange={(e) => setVonageApiSecret(e.target.value)}
                    placeholder={vonageConfigData?.hasApiSecret ? "••••••••" : "Enter API Secret"}
                    data-testid="input-vonage-api-secret"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiSecret(!showApiSecret)}
                  >
                    {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="vonage-from-number">From Number</Label>
                <Input
                  id="vonage-from-number"
                  type="text"
                  value={vonageFromNumber}
                  onChange={(e) => setVonageFromNumber(e.target.value)}
                  placeholder={vonageConfigData?.hasFromNumber ? "••••••••" : "+41xxxxxxxxx"}
                  data-testid="input-vonage-from-number"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  The phone number registered with Vonage (in E.164 format)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTestDialog(true)}
                  disabled={testVonageMutation.isPending || !isConfigured}
                  data-testid="button-test-vonage"
                >
                  {testVonageMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Test SMS
                </Button>
                <Button
                  onClick={() => saveVonageConfigMutation.mutate({
                    apiKey: vonageApiKey || undefined,
                    apiSecret: vonageApiSecret || undefined,
                    fromNumber: vonageFromNumber || undefined,
                    isEnabled: vonageEnabled,
                  })}
                  disabled={saveVonageConfigMutation.isPending || (!vonageApiKey && !vonageApiSecret && !vonageFromNumber)}
                  data-testid="button-save-vonage"
                >
                  {saveVonageConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-save mr-2"></i>}
                  {t("common.save", "Save")}
                </Button>
                {isConfigured && (
                  <Button
                    variant="destructive"
                    onClick={() => deleteVonageConfigMutation.mutate()}
                    disabled={deleteVonageConfigMutation.isPending}
                    data-testid="button-delete-vonage"
                  >
                    {deleteVonageConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <Trash2 className="h-4 w-4 mr-2" />}
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">How to set up Vonage SMS</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Create a Vonage account at <a href="https://www.vonage.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">vonage.com</a></li>
                <li>Navigate to Dashboard → API Settings to find your API Key and Secret</li>
                <li>Purchase a phone number for sending SMS</li>
                <li>Enter your credentials above and save</li>
                <li>Use the "Test SMS" button to verify the configuration</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>Note:</strong> SMS messages will be sent from your Vonage number. Standard SMS rates apply based on your Vonage plan.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Test SMS Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test SMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test-phone">Phone Number</Label>
              <PhoneInputWithCountry
                id="test-phone"
                value={testPhoneNumber}
                onChange={(value) => setTestPhoneNumber(value)}
                placeholder="791234567"
                data-testid="input-test-phone"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter a phone number to receive the test SMS. Leave empty to send to the configured from number.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => testVonageMutation.mutate(testPhoneNumber || undefined)}
                disabled={testVonageMutation.isPending}
              >
                {testVonageMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Send Test
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
