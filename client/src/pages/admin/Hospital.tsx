import React, { useState, useEffect, Fragment } from "react";
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
import { CalendarIcon, Syringe, Stethoscope, Briefcase, Copy, Check, Link as LinkIcon, RefreshCw, Trash2, Eye, EyeOff, Settings, ExternalLink, Plus, MessageSquare, FileText, Loader2, Database, CheckCircle2, AlertCircle, Clock, Download } from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateLong, formatDateTime, formatCurrency, formatDateForInput } from "@/lib/dateUtils";
import type { Unit } from "@shared/schema";
import { DischargeBriefTemplateManager } from "@/components/dischargeBriefs/DischargeBriefTemplateManager";
import { generateQuestionnairePosterPdf } from "@/lib/questionnairePosterPdf";
import { LoginAuditLogTab } from "./LoginAuditLog";

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
  const [activeTab, setActiveTab] = useState<"settings" | "data" | "links" | "units" | "rooms" | "checklists" | "templates" | "suppliers" | "integrations" | "tardoc" | "security" | "experimental">("settings");
  
  // Rooms management state
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [roomFormName, setRoomFormName] = useState('');
  const [roomFormType, setRoomFormType] = useState<'OP' | 'PACU'>('OP');
  

  // Closures management state
  const [closureDialogOpen, setClosureDialogOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<any | null>(null);
  const [closureForm, setClosureForm] = useState({ name: '', startDate: '', endDate: '', notes: '' });
  const [deleteClosureId, setDeleteClosureId] = useState<string | null>(null);

  const { data: closures = [], isLoading: closuresLoading } = useQuery<any[]>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/closures`],
    enabled: !!activeHospital?.id,
  });

  const closureMutation = useMutation({
    mutationFn: async (data: { name: string; startDate: string; endDate: string; notes?: string }) => {
      if (editingClosure) {
        const res = await apiRequest("PATCH", `/api/hospitals/${activeHospital!.id}/closures/${editingClosure.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/hospitals/${activeHospital!.id}/closures`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${activeHospital?.id}/closures`] });
      setClosureDialogOpen(false);
      setEditingClosure(null);
      setClosureForm({ name: '', startDate: '', endDate: '', notes: '' });
      toast({ title: editingClosure ? t("admin.closureUpdated", "Closure updated") : t("admin.closureCreated", "Closure created") });
    },
    onError: () => {
      toast({ title: t("admin.closureSaveFailed", "Failed to save closure"), variant: "destructive" });
    },
  });

  const deleteClosureMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/hospitals/${activeHospital!.id}/closures/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${activeHospital?.id}/closures`] });
      setDeleteClosureId(null);
      toast({ title: t("admin.closureDeleted", "Closure deleted") });
    },
    onError: () => {
      toast({ title: t("admin.closureDeleteFailed", "Failed to delete closure"), variant: "destructive" });
    },
  });

  // Supplier catalog states
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplierName: "Galexis",
    supplierType: "api" as "api" | "database",
    customerNumber: "",
    apiPassword: "",
  });

  // Catalog upload state
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [catalogPreview, setCatalogPreview] = useState<{ headers: string[]; sampleRows: any[][]; totalRows: number } | null>(null);
  const [catalogMapping, setCatalogMapping] = useState<Record<string, number | undefined>>({});
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogParsing, setCatalogParsing] = useState(false);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  const { data: catalogStatus, isLoading: catalogStatusLoading, refetch: refetchCatalogStatus } = useQuery<{
    articlesCount: number;
    lastUpdated: string | null;
  }>({
    queryKey: ['/api/admin/catalog/status'],
    enabled: activeTab === 'suppliers',
  });
  
  // Galexis debug test state
  const [galexisDebugQuery, setGalexisDebugQuery] = useState("");
  const [galexisDebugResult, setGalexisDebugResult] = useState<any>(null);
  const [galexisDebugLoading, setGalexisDebugLoading] = useState(false);

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
    companyGln: "",
    companyZsr: "",
    defaultTpValue: "",
    companyBankIban: "",
    companyBankName: "",
    runwayTargetDays: 14,
    runwayWarningDays: 7,
    runwayLookbackDays: 30,
    questionnaireDisabled: false,
    preSurgeryReminderDisabled: false,
    appointmentReminderDisabled: false,
    addonPatientChat: false,
    currency: "CHF" as string,
    dateFormat: "european" as string,
    hourFormat: "24h" as string,
    timezone: "Europe/Zurich" as string,
    defaultLanguage: "de" as string,
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
  const { data: externalSurgeryTokenData } = useQuery<{ token: string | null; notificationEmail: string | null }>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/external-surgery-token`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Kiosk token query
  const { data: kioskTokenData } = useQuery<{ kioskToken: string | null }>({
    queryKey: [`/api/admin/${activeHospital?.id}/kiosk-token`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Questionnaire link state
  const [linkCopied, setLinkCopied] = useState(false);
  const [externalSurgeryLinkCopied, setExternalSurgeryLinkCopied] = useState(false);

  // External surgery notification email state
  const [notificationEmail, setNotificationEmail] = useState('');
  useEffect(() => {
    setNotificationEmail(externalSurgeryTokenData?.notificationEmail || '');
  }, [externalSurgeryTokenData?.notificationEmail]);

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

  // External surgery notification email mutation
  const saveNotificationEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { externalSurgeryNotificationEmail: email });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/hospitals/${activeHospital?.id}/external-surgery-token`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      toast({ title: t("common.success"), description: t("admin.notificationEmailSaved", "Notification email saved") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to save notification email", variant: "destructive" });
    },
  });

  // Kiosk token mutations
  const generateKioskTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/${activeHospital?.id}/kiosk-token/generate`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/kiosk-token`] });
      toast({ title: t("common.success"), description: t("admin.kioskLinkGenerated", "Kiosk link generated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to generate link", variant: "destructive" });
    },
  });

  const deleteKioskTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/${activeHospital?.id}/kiosk-token`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/kiosk-token`] });
      toast({ title: t("common.success"), description: t("admin.kioskLinkDisabled", "Kiosk link disabled") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to disable link", variant: "destructive" });
    },
  });

  const getKioskUrl = () => {
    if (!kioskTokenData?.kioskToken) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/kiosk/${kioskTokenData.kioskToken}`;
  };

  const [kioskLinkCopied, setKioskLinkCopied] = useState(false);
  const handleCopyKioskLink = async () => {
    const url = getKioskUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setKioskLinkCopied(true);
        toast({ title: t("common.success"), description: t("admin.linkCopied", "Link copied to clipboard") });
        setTimeout(() => setKioskLinkCopied(false), 2000);
      } catch (err) {
        toast({ title: t("common.error"), description: t("admin.failedToCopy", "Failed to copy link"), variant: "destructive" });
      }
    }
  };

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

  const handleCatalogFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCatalogFile(file);
    setCatalogParsing(true);
    
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const response = await apiRequest("POST", "/api/admin/catalog/preview", {
          fileData: base64,
          fileName: file.name,
        });
        const preview = await response.json();
        setCatalogPreview(preview);
        
        const autoMapping: Record<string, number | undefined> = {};
        const mappableFields = [
          { key: 'descriptionDe', patterns: ['description', 'beschreibung', 'name', 'bezeichnung', 'artikel', 'product'] },
          { key: 'pharmacode', patterns: ['pharmacode', 'pharma'] },
          { key: 'gtin', patterns: ['gtin', 'ean', 'barcode'] },
          { key: 'pexf', patterns: ['pexf', 'fabrikabgabe', 'ex-factory', 'exfactory', 'basispreis', 'einkauf'] },
          { key: 'ppub', patterns: ['ppub', 'publikum', 'public', 'verkauf'] },
          { key: 'swissmedicNo', patterns: ['swissmedic', 'zulassung'] },
          { key: 'smcat', patterns: ['kategorie', 'category', 'smcat', 'kat'] },
          { key: 'saleCode', patterns: ['sale', 'status', 'verkaufscode'] },
        ];
        
        preview.headers.forEach((header: string, idx: number) => {
          if (!header) return;
          const lower = header.toLowerCase().trim();
          for (const field of mappableFields) {
            if (field.patterns.some(p => lower.includes(p)) && !autoMapping[field.key]) {
              autoMapping[field.key] = idx;
            }
          }
        });
        
        setCatalogMapping(autoMapping);
        setShowMappingDialog(true);
      } catch (error: any) {
        toast({ title: t("common.error"), description: error.message || "Failed to preview file", variant: "destructive" });
      } finally {
        setCatalogParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCatalogImport = async () => {
    if (!catalogFile || catalogMapping.descriptionDe === undefined) return;
    setCatalogImporting(true);
    
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(catalogFile);
      });
      
      const response = await apiRequest("POST", "/api/admin/catalog/import", {
        fileData: base64,
        fileName: catalogFile.name,
        columnMapping: catalogMapping,
      });
      const result = await response.json();
      
      toast({ 
        title: t("common.success"), 
        description: `Imported ${result.imported} articles${result.skipped > 0 ? `, skipped ${result.skipped}` : ''}`,
      });
      
      setShowMappingDialog(false);
      setCatalogFile(null);
      setCatalogPreview(null);
      setCatalogMapping({});
      refetchCatalogStatus();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || "Failed to import catalog", variant: "destructive" });
    } finally {
      setCatalogImporting(false);
    }
  };

  const handleCatalogSync = async () => {
    if (!activeHospital?.id) return;
    setCatalogSyncing(true);
    try {
      const response = await apiRequest("POST", `/api/admin/catalog/sync-items/${activeHospital.id}`);
      const result = await response.json();
      toast({
        title: t("common.success"),
        description: `Synced items: ${result.matched} matched, ${result.created} new, ${result.updated} updated, ${result.unmatched} unmatched`,
      });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || "Failed to sync items", variant: "destructive" });
    } finally {
      setCatalogSyncing(false);
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
        companyGln: fullHospitalData.companyGln || "",
        companyZsr: fullHospitalData.companyZsr || "",
        defaultTpValue: fullHospitalData.defaultTpValue || "",
        companyBankIban: fullHospitalData.companyBankIban || "",
        companyBankName: fullHospitalData.companyBankName || "",
        runwayTargetDays: fullHospitalData.runwayTargetDays ?? 14,
        runwayWarningDays: fullHospitalData.runwayWarningDays ?? 7,
        runwayLookbackDays: fullHospitalData.runwayLookbackDays ?? 30,
        questionnaireDisabled: fullHospitalData.questionnaireDisabled ?? false,
        preSurgeryReminderDisabled: fullHospitalData.preSurgeryReminderDisabled ?? false,
        appointmentReminderDisabled: fullHospitalData.appointmentReminderDisabled ?? false,
        addonPatientChat: fullHospitalData.addonPatientChat ?? false,
        currency: fullHospitalData.currency || "CHF",
        dateFormat: fullHospitalData.dateFormat || "european",
        hourFormat: fullHospitalData.hourFormat || "24h",
        timezone: fullHospitalData.timezone || "Europe/Zurich",
        defaultLanguage: fullHospitalData.defaultLanguage || "de",
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

  // Update appointment reminder disabled mutation (for quick toggle)
  const updateAppointmentReminderDisabledMutation = useMutation({
    mutationFn: async (disabled: boolean) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { appointmentReminderDisabled: disabled });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: t("common.success"),
        description: hospitalForm.appointmentReminderDisabled
          ? t("admin.appointmentReminderDisabled", "Appointment reminder disabled")
          : t("admin.appointmentReminderEnabledSuccess", "Appointment reminder enabled")
      });
    },
    onError: (error: any) => {
      setHospitalForm(prev => ({ ...prev, appointmentReminderDisabled: !prev.appointmentReminderDisabled }));
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
    setEditingTemplate(null); // Clear editing template so it creates a new one
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Vertical sidebar nav */}
          <TabsList className="flex flex-row md:flex-col h-auto w-full md:w-52 shrink-0 justify-start overflow-x-auto md:overflow-x-visible scrollbar-hide bg-muted/50 md:bg-transparent p-1 md:p-0 md:gap-1">
            <TabsTrigger value="settings" data-testid="tab-settings" className="justify-start md:w-full">
              <Settings className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t("admin.settings", "Settings")}</span>
            </TabsTrigger>
            <TabsTrigger value="data" data-testid="tab-data" className="justify-start md:w-full">
              <i className="fas fa-database mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.data", "Data")}</span>
            </TabsTrigger>
            <TabsTrigger value="links" data-testid="tab-links" className="justify-start md:w-full">
              <i className="fas fa-link mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.links", "Links")}</span>
            </TabsTrigger>
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
            <TabsTrigger value="suppliers" data-testid="tab-suppliers" className="justify-start md:w-full">
              <i className="fas fa-truck mr-2 shrink-0"></i>
              <span className="truncate">Suppliers</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations" className="justify-start md:w-full">
              <Settings className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t("admin.integrations", "Integrations")}</span>
            </TabsTrigger>
            <TabsTrigger value="tardoc" data-testid="tab-tardoc" className="justify-start md:w-full">
              <i className="fas fa-file-invoice mr-2 shrink-0"></i>
              <span className="truncate">TARDOC</span>
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security" className="justify-start md:w-full">
              <i className="fas fa-shield-halved mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.security", "Security")}</span>
            </TabsTrigger>
            <TabsTrigger value="experimental" data-testid="tab-experimental" className="justify-start md:w-full">
              <i className="fas fa-flask mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.experimental", "Experimental")}</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab content area */}
          <div className="flex-1 min-w-0">

        {/* Settings Tab Content — with horizontal sub-tabs */}
        <TabsContent value="settings">
        <div className="space-y-4">
          <Tabs defaultValue="company">
            <TabsList>
              <TabsTrigger value="company">
                <i className="fas fa-building mr-2"></i>
                {t("admin.generalSettings", "General Settings")}
              </TabsTrigger>
              <TabsTrigger value="closures">
                <i className="fas fa-calendar-xmark mr-2"></i>
                {t("admin.closures", "Closures")}
              </TabsTrigger>
              <TabsTrigger value="general">
                <i className="fas fa-globe mr-2"></i>
                {t("admin.regionalPreferences", "Regional Preferences")}
              </TabsTrigger>
              <TabsTrigger value="runway">
                <i className="fas fa-chart-line mr-2"></i>
                {t("admin.stockRunwayAlerts", "Stock Runway Alerts")}
              </TabsTrigger>
            </TabsList>

            {/* Closures Sub-Tab */}
            <TabsContent value="closures" className="mt-4">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("admin.closures", "Closures")}</h3>
                    <p className="text-sm text-muted-foreground">{t("admin.closuresDescription", "Define dates when the clinic is closed (holidays, breaks). Surgeries cannot be booked on these dates.")}</p>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingClosure(null);
                      setClosureForm({ name: '', startDate: '', endDate: '', notes: '' });
                      setClosureDialogOpen(true);
                    }}
                    size="sm"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    {t("admin.addClosure", "Add Closure")}
                  </Button>
                </div>

                {closuresLoading ? (
                  <div className="text-center py-8">
                    <i className="fas fa-spinner fa-spin text-2xl text-primary"></i>
                  </div>
                ) : closures.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg p-8 text-center">
                    <i className="fas fa-calendar-xmark text-4xl text-muted-foreground mb-4"></i>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{t("admin.noClosures", "No closures configured")}</h3>
                    <p className="text-muted-foreground mb-4">{t("admin.noClosuresMessage", "The clinic is open every day. Add closures for holidays or breaks.")}</p>
                    <Button
                      onClick={() => {
                        setEditingClosure(null);
                        setClosureForm({ name: '', startDate: '', endDate: '', notes: '' });
                        setClosureDialogOpen(true);
                      }}
                      size="sm"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      {t("admin.addClosure", "Add Closure")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {closures.map((closure: any) => {
                      const isPast = new Date(closure.endDate) < new Date(new Date().toISOString().split('T')[0]);
                      return (
                        <div key={closure.id} className={`border border-border rounded-lg p-4 ${isPast ? 'opacity-50' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <i className={`fas fa-calendar-xmark ${isPast ? 'text-muted-foreground' : 'text-amber-500'}`}></i>
                              <div>
                                <div className="font-medium text-foreground">{closure.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {formatDateLong(closure.startDate)}
                                  {closure.startDate !== closure.endDate && ` — ${formatDateLong(closure.endDate)}`}
                                </div>
                                {closure.notes && (
                                  <div className="text-sm text-muted-foreground mt-1">{closure.notes}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isPast && (
                                <span className="text-xs text-muted-foreground mr-2">{t("admin.past", "Past")}</span>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingClosure(closure);
                                  setClosureForm({
                                    name: closure.name,
                                    startDate: closure.startDate,
                                    endDate: closure.endDate,
                                    notes: closure.notes || '',
                                  });
                                  setClosureDialogOpen(true);
                                }}
                              >
                                <i className="fas fa-pen text-xs"></i>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteClosureId(closure.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* General Settings Sub-Tab */}
            <TabsContent value="general" className="mt-4">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
                <p className="text-sm text-muted-foreground mb-4">{t("admin.generalSettingsDescription", "Configure regional preferences for this hospital")}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Currency */}
                  <div>
                    <Label>{t("admin.currency", "Currency")}</Label>
                    <Select
                      value={hospitalForm.currency}
                      onValueChange={(value) => setHospitalForm(prev => ({ ...prev, currency: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CHF">CHF (Swiss Franc)</SelectItem>
                        <SelectItem value="EUR">EUR (Euro)</SelectItem>
                        <SelectItem value="USD">USD (US Dollar)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.currencyDescription", "Currency used for displaying prices across the app")}</p>
                  </div>

                  {/* Timezone */}
                  <div>
                    <Label>{t("admin.timezone", "Timezone")}</Label>
                    <Select
                      value={hospitalForm.timezone}
                      onValueChange={(value) => setHospitalForm(prev => ({ ...prev, timezone: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Europe/Zurich">Europe/Zurich</SelectItem>
                        <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                        <SelectItem value="Europe/Vienna">Europe/Vienna</SelectItem>
                        <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                        <SelectItem value="Europe/London">Europe/London</SelectItem>
                        <SelectItem value="America/New_York">America/New York</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los Angeles</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.timezoneDescription", "Hospital timezone for scheduling and timestamps")}</p>
                  </div>

                  {/* Date Format */}
                  <div>
                    <Label>{t("admin.dateFormatLabel", "Date Format")}</Label>
                    <Select
                      value={hospitalForm.dateFormat}
                      onValueChange={(value) => setHospitalForm(prev => ({ ...prev, dateFormat: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="european">{t("admin.dateFormatEuropean", "European (dd.MM.yyyy)")}</SelectItem>
                        <SelectItem value="american">{t("admin.dateFormatAmerican", "American (MM/dd/yyyy)")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.dateFormatDescription", "How dates are displayed across the app")}</p>
                  </div>

                  {/* Hour Format */}
                  <div>
                    <Label>{t("admin.hourFormatLabel", "Hour Format")}</Label>
                    <Select
                      value={hospitalForm.hourFormat}
                      onValueChange={(value) => setHospitalForm(prev => ({ ...prev, hourFormat: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">{t("admin.hourFormat24h", "24-hour (14:30)")}</SelectItem>
                        <SelectItem value="12h">{t("admin.hourFormat12h", "12-hour (2:30 PM)")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.hourFormatDescription", "How times are displayed across the app")}</p>
                  </div>

                  {/* Default Language */}
                  <div>
                    <Label>{t("admin.defaultLanguage", "Default Language")}</Label>
                    <Select
                      value={hospitalForm.defaultLanguage}
                      onValueChange={(value) => setHospitalForm(prev => ({ ...prev, defaultLanguage: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="de">{t("admin.defaultLanguageDe", "Deutsch")}</SelectItem>
                        <SelectItem value="en">{t("admin.defaultLanguageEn", "English")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("admin.defaultLanguageDescription", "Language used for automated emails and SMS notifications")}</p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleSaveHospital}
                    disabled={updateHospitalMutation.isPending || isUploadingLogo}
                  >
                    <i className="fas fa-save mr-2"></i>
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Company Settings Sub-Tab */}
            <TabsContent value="company" className="mt-4">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
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
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    <div className="flex-shrink-0 flex flex-col items-center sm:items-start">
                      <div className="w-24 h-24 sm:w-32 sm:h-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
                        <div className="sm:col-span-2">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

                      {/* TARDOC Billing Identifiers */}
                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-medium mb-3">{t("admin.tardocBilling", "TARDOC / Insurance Billing")}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <Label htmlFor="company-gln-inline">GLN</Label>
                            <Input
                              id="company-gln-inline"
                              value={hospitalForm.companyGln}
                              onChange={(e) => setHospitalForm(prev => ({ ...prev, companyGln: e.target.value }))}
                              placeholder="7601000000000"
                              maxLength={13}
                              data-testid="input-company-gln-inline"
                            />
                            <p className="text-xs text-muted-foreground mt-1">13-digit Global Location Number</p>
                          </div>
                          <div>
                            <Label htmlFor="company-zsr-inline">ZSR</Label>
                            <Input
                              id="company-zsr-inline"
                              value={hospitalForm.companyZsr}
                              onChange={(e) => setHospitalForm(prev => ({ ...prev, companyZsr: e.target.value }))}
                              placeholder="Z123456"
                              data-testid="input-company-zsr-inline"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3">
                          <div>
                            <Label htmlFor="default-tp-value-inline">{t("admin.defaultTpValue", "Default TP Value")}</Label>
                            <Input
                              id="default-tp-value-inline"
                              value={hospitalForm.defaultTpValue}
                              onChange={(e) => setHospitalForm(prev => ({ ...prev, defaultTpValue: e.target.value }))}
                              placeholder="1.0000"
                              data-testid="input-default-tp-value-inline"
                            />
                            <p className="text-xs text-muted-foreground mt-1">CHF per tax point</p>
                          </div>
                          <div>
                            <Label htmlFor="bank-iban-inline">IBAN</Label>
                            <Input
                              id="bank-iban-inline"
                              value={hospitalForm.companyBankIban}
                              onChange={(e) => setHospitalForm(prev => ({ ...prev, companyBankIban: e.target.value }))}
                              placeholder="CH93 0076 2011 6238 5295 7"
                              data-testid="input-bank-iban-inline"
                            />
                            <p className="text-xs text-muted-foreground mt-1">{t("admin.ibanHint", "For QR-bill on Tiers Garant invoices")}</p>
                          </div>
                          <div>
                            <Label htmlFor="bank-name-inline">{t("admin.bankName", "Bank")}</Label>
                            <Input
                              id="bank-name-inline"
                              value={hospitalForm.companyBankName}
                              onChange={(e) => setHospitalForm(prev => ({ ...prev, companyBankName: e.target.value }))}
                              placeholder="UBS Switzerland AG"
                              data-testid="input-bank-name-inline"
                            />
                          </div>
                        </div>
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
            </TabsContent>

            {/* Stock Runway Alerts Sub-Tab */}
            <TabsContent value="runway" className="mt-4">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
                <p className="text-sm text-muted-foreground mb-4">{t("admin.runwayConfigDescription")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleSaveHospital}
                    disabled={updateHospitalMutation.isPending || isUploadingLogo}
                    data-testid="button-save-runway-inline"
                  >
                    <i className="fas fa-save mr-2"></i>
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </TabsContent>

          </Tabs>
        </div>
        </TabsContent>

        {/* Links Tab Content */}
        <TabsContent value="links">
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const url = getQuestionnaireUrl();
                            if (!url) return;
                            await generateQuestionnairePosterPdf({
                              questionnaireUrl: url,
                              hospitalName: hospitalForm.name || activeHospital?.name || "",
                              companyLogoUrl: hospitalForm.companyLogoUrl || undefined,
                            });
                          }}
                          data-testid="button-download-qr-poster"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t("admin.downloadQrPoster", "Download QR Poster")}
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

          {/* Appointment Reminder Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <i className="fas fa-calendar-check text-blue-500"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">
                    {t("admin.appointmentReminderEnabled", "Appointment Reminder")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.appointmentReminderEnabledDescription", "When enabled, patients receive a reminder the evening before their clinic appointment with a cancel link")}
                  </p>
                </div>
              </div>
              <Switch
                checked={!hospitalForm.appointmentReminderDisabled}
                onCheckedChange={(checked) => {
                  setHospitalForm(prev => ({ ...prev, appointmentReminderDisabled: !checked }));
                  updateAppointmentReminderDisabledMutation.mutate(!checked);
                }}
                disabled={updateAppointmentReminderDisabledMutation.isPending}
                data-testid="switch-appointment-reminder-enabled"
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

              {/* Notification Email */}
              <div className="border-t border-border pt-4 space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t("admin.notificationEmailLabel", "Notification Email")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("admin.notificationEmailDescription", "When set, new external surgery requests are sent to this email instead of all OR admins.")}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                    placeholder={t("admin.notificationEmailPlaceholder", "e.g. op-planung@spital.ch")}
                    className="flex-1"
                    data-testid="input-notification-email"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveNotificationEmailMutation.mutate(notificationEmail)}
                    disabled={saveNotificationEmailMutation.isPending || notificationEmail === (externalSurgeryTokenData?.notificationEmail || '')}
                    data-testid="button-save-notification-email"
                  >
                    {saveNotificationEmailMutation.isPending ? (
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {t("common.save", "Save")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Worktime Kiosk Link Section */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    {t("admin.worktimeKioskLink", "Worktime Kiosk")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.worktimeKioskDescription", "Public link for a shared tablet where staff can log work hours using a personal PIN")}
                  </p>
                </div>
              </div>

              {kioskTokenData?.kioskToken ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Input
                      value={getKioskUrl() || ""}
                      readOnly
                      className="flex-1 bg-background text-sm font-mono"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyKioskLink}
                    >
                      {kioskLinkCopied ? (
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
                      onClick={() => generateKioskTokenMutation.mutate()}
                      disabled={generateKioskTokenMutation.isPending}
                    >
                      {generateKioskTokenMutation.isPending ? (
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
                        if (confirm(t("admin.disableKioskLinkConfirm", "Are you sure you want to disable this link? Staff won't be able to log time via the kiosk."))) {
                          deleteKioskTokenMutation.mutate();
                        }
                      }}
                      disabled={deleteKioskTokenMutation.isPending}
                    >
                      {deleteKioskTokenMutation.isPending ? (
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
                    {t("admin.noKioskLinkGenerated", "No kiosk link has been generated yet.")}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => generateKioskTokenMutation.mutate()}
                    disabled={generateKioskTokenMutation.isPending}
                  >
                    {generateKioskTokenMutation.isPending ? (
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
          {/* Patient Booking Page Section */}
          <BookingTokenSection hospitalId={activeHospital?.id} isAdmin={isAdmin} />
        </div>
        </TabsContent>

        {/* Data Tab Content */}
        <TabsContent value="data">
        <div className="space-y-4">
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
        </TabsContent>

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

        {/* Suppliers Tab Content */}
        <TabsContent value="suppliers">
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

          {/* Product Catalog Card */}
          <div className="bg-card border border-border rounded-lg p-4" data-testid="card-product-catalog">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">Product Catalog</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    Database
                  </span>
                  {catalogStatus && catalogStatus.articlesCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />Loaded
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      <AlertCircle className="w-3 h-3 inline mr-1" />Empty
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <Database className="w-3 h-3 inline mr-1" />
                  Upload supplier Excel file with product prices
                </p>
                {catalogStatusLoading ? (
                  <p className="text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />Loading status...
                  </p>
                ) : catalogStatus ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Articles: <span className="font-medium">{catalogStatus.articlesCount?.toLocaleString() || 0}</span>
                    </p>
                    {catalogStatus.lastUpdated && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last updated: {formatDateTime(catalogStatus.lastUpdated)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No catalog uploaded yet
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleCatalogFileSelect}
                    disabled={catalogParsing}
                    data-testid="input-catalog-file"
                  />
                  <Button variant="outline" size="sm" asChild disabled={catalogParsing}>
                    <span>
                      {catalogParsing ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-1" />
                      )}
                      {catalogParsing ? 'Reading file...' : 'Upload Excel'}
                    </span>
                  </Button>
                </label>
                {catalogStatus && catalogStatus.articlesCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCatalogSync}
                    disabled={catalogSyncing}
                    data-testid="button-catalog-sync"
                  >
                    {catalogSyncing ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Syncing...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-1" />Sync Items</>
                    )}
                  </Button>
                )}
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
                            Last sync: {formatDateTime(catalog.lastSyncAt)} - {catalog.lastSyncMessage || catalog.lastSyncStatus}
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
                                  Your Price: {galexisDebugResult.yourPrice ? formatCurrency(galexisDebugResult.yourPrice) : 'N/A'} |
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
          {priceSyncJobs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-md font-semibold text-foreground mb-3">Recent Sync Jobs</h3>
              <div className="space-y-2">
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
                        {formatDateTime(job.createdAt)}
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
        </TabsContent>

        {/* Integrations Tab Content */}
        <TabsContent value="integrations">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t("admin.integrations", "Integrations")}</h2>

          {/* SMS Provider Selector */}
          <SmsProviderSelector hospitalId={activeHospital?.id} />

          <Tabs defaultValue="aspsms">
            <TabsList>
              <TabsTrigger value="calcom">
                <i className="fas fa-calendar mr-2"></i>
                Cal.com
              </TabsTrigger>
              <TabsTrigger value="aspsms">
                <i className="fas fa-comment-sms mr-2"></i>
                ASPSMS
              </TabsTrigger>
              <TabsTrigger value="vonage">
                <i className="fas fa-comment-sms mr-2"></i>
                Vonage SMS
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calcom" className="mt-4">
              <CalcomIntegrationCard hospitalId={activeHospital?.id} />
            </TabsContent>
            <TabsContent value="aspsms" className="mt-4">
              <AspsmsIntegrationCard hospitalId={activeHospital?.id} />
            </TabsContent>
            <TabsContent value="vonage" className="mt-4">
              <VonageIntegrationCard hospitalId={activeHospital?.id} />
            </TabsContent>
          </Tabs>
        </div>
        </TabsContent>

        {/* TARDOC Tab Content */}
        <TabsContent value="tardoc">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">TARDOC</h2>
              <p className="text-sm text-muted-foreground">{t("admin.tardocTabDescription", "Swiss tariff catalogs, procedure codes, and billing configuration.")}</p>
            </div>

            {/* TARDOC Billing Identifiers */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-3">{t("admin.tardocBillingIds", "Billing Identifiers")}</h3>
              <p className="text-sm text-muted-foreground mb-3">{t("admin.tardocBillingIdsDesc", "GLN, ZSR, and bank details are configured in Settings → Company.")}</p>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("settings")}>
                <i className="fas fa-arrow-right mr-2"></i>
                {t("admin.goToCompanySettings", "Go to Company Settings")}
              </Button>
            </div>

            {/* TARDOC Catalog Import */}
            <TardocIntegrationCard hospitalId={activeHospital?.id} />

            {/* CHOP Procedures Import */}
            <ChopIntegrationCard />

            {/* Ambulante Pauschalen Catalog Import */}
            <ApIntegrationCard hospitalId={activeHospital?.id} />

            {/* TARDOC Cumulation Rules Import */}
            <CumulationRulesCard hospitalId={activeHospital?.id} />

            {/* TPW Rates Management */}
            <TpwRatesCard hospitalId={activeHospital?.id} />
          </div>
        </TabsContent>

        {/* Security Tab Content — Login Audit Log */}
        <TabsContent value="security">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">{t("admin.loginHistory", "Login History")}</h3>
            <LoginAuditLogTab hospitalId={activeHospital?.id} />
          </div>
        </TabsContent>

        <TabsContent value="experimental">
          <div className="bg-card border border-amber-500/30 rounded-lg p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <i className="fas fa-flask text-amber-500"></i>
              {t("admin.experimental", "Experimental")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("admin.experimentalDescription", "Features under testing. Enable at your own discretion.")}
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                <div className="flex-1">
                  <Label className="text-sm font-medium">
                    {t("admin.patientChat", "Patient Chat")}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("admin.patientChatDescription", "2-way patient chat via the portal with SMS notifications.")}
                  </p>
                </div>
                <Switch
                  checked={hospitalForm.addonPatientChat}
                  onCheckedChange={(checked) => {
                    setHospitalForm(prev => ({ ...prev, addonPatientChat: checked }));
                    updateHospitalMutation.mutate({ ...hospitalForm, addonPatientChat: checked });
                  }}
                />
              </div>
            </div>
          </div>
        </TabsContent>
          </div>{/* end tab content area */}
        </div>{/* end flex container */}
      </Tabs>

      {/* Closure Dialog */}
      <Dialog open={closureDialogOpen} onOpenChange={(open) => {
        setClosureDialogOpen(open);
        if (!open) { setEditingClosure(null); setClosureForm({ name: '', startDate: '', endDate: '', notes: '' }); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClosure ? t("admin.editClosure", "Edit Closure") : t("admin.addClosure", "Add Closure")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("common.name", "Name")} *</Label>
              <Input
                value={closureForm.name}
                onChange={(e) => setClosureForm({ ...closureForm, name: e.target.value })}
                placeholder={t("admin.closureNamePlaceholder", "e.g. Christmas Holiday, Summer Break")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("admin.startDate", "Start Date")} *</Label>
                <Input
                  type="date"
                  value={closureForm.startDate}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setClosureForm({
                      ...closureForm,
                      startDate: newStart,
                      endDate: closureForm.endDate && closureForm.endDate < newStart ? newStart : closureForm.endDate,
                    });
                  }}
                />
              </div>
              <div>
                <Label>{t("admin.endDate", "End Date")} *</Label>
                <Input
                  type="date"
                  value={closureForm.endDate}
                  onChange={(e) => setClosureForm({ ...closureForm, endDate: e.target.value })}
                  min={closureForm.startDate || undefined}
                />
              </div>
            </div>
            <div>
              <Label>{t("common.notes", "Notes")}</Label>
              <Input
                value={closureForm.notes}
                onChange={(e) => setClosureForm({ ...closureForm, notes: e.target.value })}
                placeholder={t("admin.closureNotesPlaceholder", "Optional notes about this closure")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClosureDialogOpen(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={() => closureMutation.mutate({
                  name: closureForm.name,
                  startDate: closureForm.startDate,
                  endDate: closureForm.endDate,
                  notes: closureForm.notes || undefined,
                })}
                disabled={!closureForm.name || !closureForm.startDate || !closureForm.endDate || closureMutation.isPending}
              >
                {closureMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {editingClosure ? t("common.save", "Save") : t("common.create", "Create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Closure Confirmation */}
      <AlertDialog open={!!deleteClosureId} onOpenChange={(open) => { if (!open) setDeleteClosureId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteClosure", "Delete Closure")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.deleteClosureConfirm", "Are you sure you want to delete this closure? Surgeries may then be booked on these dates.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteClosureId && deleteClosureMutation.mutate(deleteClosureId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Catalog Column Mapping Dialog */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map Excel Columns</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              File: <span className="font-medium">{catalogFile?.name}</span> — {catalogPreview?.totalRows?.toLocaleString()} rows
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'descriptionDe', label: 'Description (required)', required: true },
                { key: 'pharmacode', label: 'Pharmacode', required: false },
                { key: 'gtin', label: 'GTIN / EAN', required: false },
                { key: 'pexf', label: 'Price PEXF (Ex-Factory)', required: false },
                { key: 'ppub', label: 'Price PPUB (Public)', required: false },
                { key: 'swissmedicNo', label: 'Swissmedic No.', required: false },
                { key: 'smcat', label: 'Category (A/B/C/D)', required: false },
                { key: 'saleCode', label: 'Sale Code', required: false },
              ].map(field => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={catalogMapping[field.key] !== undefined ? String(catalogMapping[field.key]) : "__none__"}
                    onValueChange={(val: string) => setCatalogMapping((prev: Record<string, number | undefined>) => ({
                      ...prev,
                      [field.key]: val === "__none__" ? undefined : Number(val),
                    }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid={`select-mapping-${field.key}`}>
                      <SelectValue placeholder="— Select column —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {catalogPreview?.headers.map((h: string, idx: number) => (
                        <SelectItem key={idx} value={String(idx)}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {catalogPreview && catalogPreview.sampleRows.length > 0 && (
              <div className="mt-4">
                <Label className="text-xs text-muted-foreground mb-2 block">Preview (first {catalogPreview.sampleRows.length} rows)</Label>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        {catalogPreview.headers.map((h: string, idx: number) => (
                          <th key={idx} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {catalogPreview.sampleRows.map((row: any[], rowIdx: number) => (
                        <tr key={rowIdx} className="border-t">
                          {catalogPreview.headers.map((_: string, colIdx: number) => (
                            <td key={colIdx} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">
                              {row[colIdx] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowMappingDialog(false)} data-testid="button-cancel-mapping">
                Cancel
              </Button>
              <Button
                onClick={handleCatalogImport}
                disabled={catalogImporting || catalogMapping.descriptionDe === undefined}
                data-testid="button-import-catalog"
              >
                {catalogImporting ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Importing...</>
                ) : (
                  <>Import {catalogPreview?.totalRows?.toLocaleString()} Articles</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Timebutler Sync Card Component
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
    enabled: !!hospitalId && (mappingDialogOpen || calcomMappings.length > 0),
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
  const { data: feedsData, refetch: refetchFeeds } = useQuery<{
    feedToken: string;
    feeds: Array<{ providerId: string; feedUrl: string; calcomEventTypeId: string }>;
    isSubscribed: boolean;
    subscribedAt: string | null;
  }>({
    queryKey: [`/api/clinic/${hospitalId}/calcom-feeds`],
    enabled: !!hospitalId && calcomEnabled && calcomMappings.length > 0,
  });

  // Cal.com debug state
  const [calcomDebugOutput, setCalcomDebugOutput] = useState<string | null>(null);

  // Cal.com debug mutation
  const calcomDebugMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/clinic/${hospitalId}/calcom-debug`);
      return await response.json();
    },
    onSuccess: (data) => {
      setCalcomDebugOutput(JSON.stringify(data, null, 2));
    },
    onError: (error: any) => {
      setCalcomDebugOutput(`Error: ${error.message}`);
    },
  });

  // Cal.com disconnect ICS feeds mutation
  const calcomDisconnectMutation = useMutation({
    mutationFn: async (credentialId: number) => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/calcom-debug-disconnect`, { credentialId });
      return await response.json();
    },
    onSuccess: (data) => {
      setCalcomDebugOutput(JSON.stringify(data, null, 2));
      toast({ title: "Disconnect attempted", description: "Check output for results" });
    },
    onError: (error: any) => {
      setCalcomDebugOutput(`Error: ${error.message}`);
    },
  });

  // Cal.com test schedule versions
  const calcomScheduleTestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/clinic/${hospitalId}/calcom-debug-schedules`);
      return await response.json();
    },
    onSuccess: (data) => {
      setCalcomDebugOutput(JSON.stringify(data, null, 2));
    },
    onError: (error: any) => {
      setCalcomDebugOutput(`Error: ${error.message}`);
    },
  });

  // Cal.com manual sync trigger (availability)
  const calcomSyncMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/calcom-debug-sync`, { providerId });
      return await response.json();
    },
    onSuccess: (data) => {
      setCalcomDebugOutput(JSON.stringify(data, null, 2));
      if (data.success) {
        toast({ title: "Sync success", description: `Schedule ${data.scheduleId} updated` });
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      setCalcomDebugOutput(`Error: ${error.message}`);
    },
  });

  // Subscribe ICS feeds to Cal.com mutation
  const subscribeFeedsMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/calcom-subscribe-feeds`, { force });
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.alreadySubscribed) {
        toast({
          title: "Already subscribed",
          description: "ICS feeds already up to date — toggle associations preserved.",
        });
      } else if (data.urlsChanged) {
        toast({
          title: "URLs updated",
          description: "ICS feed URLs changed — new credential created. You may need to re-enable toggles in Cal.com.",
          variant: "destructive",
        });
      } else {
        toast({
          title: t("common.success"),
          description: `Subscribed ${data.feedUrls?.length || 0} calendar feed(s) to Cal.com`,
        });
      }
      refetchFeeds();
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
              <CalendarIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Cal.com</h3>
              <p className="text-sm text-muted-foreground">Enable appointment booking via Cal.com</p>
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
                    {t("admin.lastSync", "Last sync")}: {formatDateTime(syncStatus.calcom.lastSyncAt)}
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
                <span>{formatDateTime(calcomConfigData.lastSyncAt)}</span>
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
                    {calcomMappings.map((mapping) => {
                      const provider = providers.find(p => p.id === mapping.providerId);
                      return (
                      <div key={mapping.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="text-sm">
                          <span className="font-medium">{provider ? `${provider.firstName} ${provider.lastName}` : mapping.providerId.substring(0, 8) + '...'}</span>
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
                      );
                    })}
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
                    {feedsData?.isSubscribed && feedsData.subscribedAt && (
                      <p className="text-xs text-green-500 mt-1">
                        <i className="fas fa-check-circle mr-1"></i>
                        Subscribed on {new Date(feedsData.subscribedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {feedsData?.isSubscribed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => subscribeFeedsMutation.mutate(true)}
                        disabled={subscribeFeedsMutation.isPending}
                        data-testid="button-resubscribe-feeds"
                      >
                        {subscribeFeedsMutation.isPending ? (
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                        ) : (
                          <i className="fas fa-sync mr-2"></i>
                        )}
                        Re-subscribe to Cal.com
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => subscribeFeedsMutation.mutate(false)}
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
                    )}
                  </div>
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

            {/* Debug Section */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium">Cal.com Debug</h4>
                  <p className="text-xs text-muted-foreground">
                    Inspect connected calendars, credentials, and provider schedules
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => calcomDebugMutation.mutate()}
                    disabled={calcomDebugMutation.isPending}
                  >
                    {calcomDebugMutation.isPending ? (
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                    ) : (
                      <i className="fas fa-bug mr-2"></i>
                    )}
                    Debug Cal.com
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => calcomScheduleTestMutation.mutate()}
                    disabled={calcomScheduleTestMutation.isPending}
                  >
                    {calcomScheduleTestMutation.isPending ? (
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                    ) : (
                      <i className="fas fa-calendar mr-2"></i>
                    )}
                    Test Schedules API
                  </Button>
                  {calcomDebugOutput && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCalcomDebugOutput(null)}
                    >
                      <i className="fas fa-times mr-1"></i>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {/* Manual sync buttons per provider */}
              {calcomMappings.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-muted-foreground self-center">Sync availability:</span>
                  {calcomMappings.map((m) => {
                    const provider = providers.find(p => p.id === m.providerId);
                    return (
                      <Button
                        key={m.providerId}
                        size="sm"
                        variant="secondary"
                        className="text-xs h-7"
                        onClick={() => calcomSyncMutation.mutate(m.providerId)}
                        disabled={calcomSyncMutation.isPending}
                      >
                        {provider ? `${provider.firstName} ${provider.lastName}` : m.providerId.substring(0, 8)}
                      </Button>
                    );
                  })}
                </div>
              )}
              {calcomDebugOutput && (
                <div className="space-y-2">
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-80 whitespace-pre-wrap">
                    {calcomDebugOutput}
                  </pre>
                  {/* Quick disconnect buttons for ICS feeds */}
                  {(() => {
                    try {
                      const parsed = JSON.parse(calcomDebugOutput);
                      const icsCreds = parsed?.parsedCalendars?.filter((c: any) => c.integrationType?.includes('ics'));
                      if (icsCreds?.length > 1) {
                        return (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                            <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                              {icsCreds.length} ICS feed credentials found (should be 1). Try disconnecting duplicates:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {icsCreds.map((c: any) => (
                                <Button
                                  key={c.credentialId}
                                  size="sm"
                                  variant="destructive"
                                  className="text-xs h-7"
                                  onClick={() => calcomDisconnectMutation.mutate(c.credentialId)}
                                  disabled={calcomDisconnectMutation.isPending}
                                >
                                  Disconnect #{c.credentialId}
                                </Button>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    } catch (_) {}
                    return null;
                  })()}
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">How to set up Cal.com booking</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Create a Cal.com account and set up an event type (e.g., "Clinic Appointment")</li>
                <li>Go to Settings → Developer → API Keys and generate a new API key</li>
                <li>Paste the API key here and save</li>
                <li>Add provider mappings to link each doctor to their Cal.com event type</li>
                <li>Click "Subscribe to Cal.com" to sync your clinic calendar (blocks booked times)</li>
                <li>Use your Cal.com Event Type ID for booking integration</li>
                <li>Configure a webhook in Cal.com pointing to your app's webhook URL</li>
              </ol>
              <div className="mt-3 flex items-center gap-2 p-2 bg-background border border-border rounded-md">
                <code className="text-sm font-mono flex-1 truncate">
                  {window.location.origin}/api/webhooks/calcom/{hospitalId}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/calcom/${hospitalId}`);
                    toast({ description: t("common.copied", "Copied to clipboard") });
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </Button>
              </div>
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
                Find this in your Cal.com event type URL: cal.eu/username/event-type/<strong>123456</strong>
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

// SMS Provider Selector Component
function SmsProviderSelector({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: providerData } = useQuery<{ provider: string }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/sms-provider`],
    enabled: !!hospitalId,
  });

  const setProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest("PUT", `/api/admin/${hospitalId}/integrations/sms-provider`, { provider });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/sms-provider`] });
      toast({ title: t("common.success"), description: "SMS provider updated" });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to update SMS provider", variant: "destructive" });
    },
  });

  if (!hospitalId) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground">SMS Provider</h3>
          <p className="text-sm text-muted-foreground">
            Choose which SMS provider to use for this hospital
          </p>
        </div>
        <Select
          value={providerData?.provider || 'auto'}
          onValueChange={(value) => setProviderMutation.mutate(value)}
          disabled={setProviderMutation.isPending}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic (recommended)</SelectItem>
            <SelectItem value="aspsms">ASPSMS only</SelectItem>
            <SelectItem value="vonage">Vonage only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        <strong>Automatic:</strong> Tries ASPSMS first, then Vonage. Hospital-specific credentials take priority over default.
      </p>
    </div>
  );
}

// ASPSMS Integration Card Component
function AspsmsIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [aspsmsUserKey, setAspsmsUserKey] = useState("");
  const [aspsmsPassword, setAspsmsPassword] = useState("");
  const [aspsmsOriginator, setAspsmsOriginator] = useState("");
  const [aspsmsEnabled, setAspsmsEnabled] = useState(false);
  const [showUserKey, setShowUserKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [showTestDialog, setShowTestDialog] = useState(false);

  // ASPSMS config query
  const { data: aspsmsConfigData, isLoading: aspsmsLoading } = useQuery<{
    hospitalId: string;
    isEnabled?: boolean;
    hasUserKey?: boolean;
    hasPassword?: boolean;
    originator?: string | null;
    lastTestedAt?: string;
    lastTestStatus?: string;
    lastTestError?: string;
  }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`],
    enabled: !!hospitalId,
  });

  // Credits query
  const { data: creditsData, refetch: refetchCredits } = useQuery<{ credits: string; statusInfo: string }>({
    queryKey: [`/api/admin/${hospitalId}/integrations/aspsms/credits`],
    enabled: !!hospitalId && !!aspsmsConfigData?.hasUserKey && !!aspsmsConfigData?.hasPassword,
  });

  // Sync state when data is fetched
  useEffect(() => {
    if (aspsmsConfigData) {
      setAspsmsEnabled(aspsmsConfigData.isEnabled || false);
    }
  }, [aspsmsConfigData]);

  // Save config mutation
  const saveAspsmsConfigMutation = useMutation({
    mutationFn: async (data: { userKey?: string; password?: string; originator?: string; isEnabled: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/${hospitalId}/integrations/aspsms`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms/credits`] });
      toast({ title: t("common.success"), description: "ASPSMS configuration saved" });
      setAspsmsUserKey("");
      setAspsmsPassword("");
      setAspsmsOriginator("");
      setShowUserKey(false);
      setShowPassword(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to save ASPSMS configuration", variant: "destructive" });
    },
  });

  // Test mutation
  const testAspsmsMutation = useMutation({
    mutationFn: async (testNumber?: string) => {
      const response = await apiRequest("POST", `/api/admin/${hospitalId}/integrations/aspsms/test`, { testPhoneNumber: testNumber });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: "Test SMS sent successfully! Check your phone." });
      setShowTestDialog(false);
      setTestPhoneNumber("");
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`] });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to send test SMS", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteAspsmsConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/admin/${hospitalId}/integrations/aspsms`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/integrations/aspsms/credits`] });
      toast({ title: t("common.success"), description: "ASPSMS configuration removed" });
      setAspsmsEnabled(false);
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || "Failed to remove ASPSMS configuration", variant: "destructive" });
    },
  });

  if (!hospitalId) return null;

  const isConfigured = aspsmsConfigData?.hasUserKey && aspsmsConfigData?.hasPassword;

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">ASPSMS</h3>
              <p className="text-sm text-muted-foreground">Send SMS messages via ASPSMS with custom sender name</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={aspsmsEnabled}
              onCheckedChange={(checked) => {
                setAspsmsEnabled(checked);
                saveAspsmsConfigMutation.mutate({ isEnabled: checked });
              }}
              disabled={saveAspsmsConfigMutation.isPending || !isConfigured}
            />
            <span className={`text-sm ${aspsmsEnabled && isConfigured ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {aspsmsEnabled && isConfigured ? t("common.enabled", "Enabled") : t("common.disabled", "Disabled")}
            </span>
          </div>
        </div>

        {aspsmsLoading ? (
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

            {/* Credits Display */}
            {isConfigured && creditsData && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Credits:</span>
                <span className="font-medium text-foreground">{creditsData.credits}</span>
                <Button variant="ghost" size="sm" onClick={() => refetchCredits()} className="h-6 px-2">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}

            {aspsmsConfigData?.lastTestedAt && (
              <div className="text-sm text-muted-foreground">
                <span>Last test:</span>{" "}
                <span>{formatDateTime(aspsmsConfigData.lastTestedAt)}</span>
                {aspsmsConfigData.lastTestStatus === 'success' ? (
                  <span className="ml-2 text-green-500">✓ Success</span>
                ) : aspsmsConfigData.lastTestStatus === 'failed' ? (
                  <span className="ml-2 text-red-500">✗ Failed{aspsmsConfigData.lastTestError ? `: ${aspsmsConfigData.lastTestError}` : ''}</span>
                ) : null}
              </div>
            )}

            {/* Credentials Form */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <Label htmlFor="aspsms-user-key">UserKey</Label>
                <div className="flex gap-2">
                  <Input
                    id="aspsms-user-key"
                    type={showUserKey ? "text" : "password"}
                    value={aspsmsUserKey}
                    onChange={(e) => setAspsmsUserKey(e.target.value)}
                    placeholder={aspsmsConfigData?.hasUserKey ? "••••••••" : "Enter UserKey"}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setShowUserKey(!showUserKey)}>
                    {showUserKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="aspsms-password">API Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="aspsms-password"
                    type={showPassword ? "text" : "password"}
                    value={aspsmsPassword}
                    onChange={(e) => setAspsmsPassword(e.target.value)}
                    placeholder={aspsmsConfigData?.hasPassword ? "••••••••" : "Enter API Password"}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="aspsms-originator">Originator (Sender Name)</Label>
                <Input
                  id="aspsms-originator"
                  type="text"
                  value={aspsmsOriginator}
                  onChange={(e) => setAspsmsOriginator(e.target.value.substring(0, 11))}
                  placeholder={aspsmsConfigData?.originator || "Clinic name (max 11 chars)"}
                  maxLength={11}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sender name shown on the SMS (max 11 alphanumeric characters). Defaults to hospital name if empty.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowTestDialog(true)}
                  disabled={testAspsmsMutation.isPending || !isConfigured}
                >
                  {testAspsmsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Test SMS
                </Button>
                <Button
                  onClick={() => {
                    const shouldAutoEnable = !isConfigured && (aspsmsUserKey || aspsmsPassword);
                    const enabled = shouldAutoEnable ? true : aspsmsEnabled;
                    if (shouldAutoEnable) setAspsmsEnabled(true);
                    saveAspsmsConfigMutation.mutate({
                      userKey: aspsmsUserKey || undefined,
                      password: aspsmsPassword || undefined,
                      originator: aspsmsOriginator || undefined,
                      isEnabled: enabled,
                    });
                  }}
                  disabled={saveAspsmsConfigMutation.isPending || (!aspsmsUserKey && !aspsmsPassword && !aspsmsOriginator)}
                >
                  {saveAspsmsConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-save mr-2"></i>}
                  {t("common.save", "Save")}
                </Button>
                {isConfigured && (
                  <Button
                    variant="destructive"
                    onClick={() => deleteAspsmsConfigMutation.mutate()}
                    disabled={deleteAspsmsConfigMutation.isPending}
                  >
                    {deleteAspsmsConfigMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <Trash2 className="h-4 w-4 mr-2" />}
                    Remove
                  </Button>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">How to set up ASPSMS</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Create an ASPSMS account at <a href="https://www.aspsms.ch" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">aspsms.ch</a></li>
                <li>Find your UserKey and API Password in your ASPSMS account settings</li>
                <li>Enter your credentials above and set a sender name (originator)</li>
                <li>Use the "Test SMS" button to verify the configuration</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                <strong>Note:</strong> SMS messages will show the originator name as sender. Standard ASPSMS credit rates apply.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Test SMS Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test SMS (ASPSMS)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="aspsms-test-phone">Phone Number</Label>
              <PhoneInputWithCountry
                id="aspsms-test-phone"
                value={testPhoneNumber}
                onChange={(value) => setTestPhoneNumber(value)}
                placeholder="791234567"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter a phone number to receive the test SMS.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => testAspsmsMutation.mutate(testPhoneNumber || undefined)}
                disabled={testAspsmsMutation.isPending || !testPhoneNumber}
              >
                {testAspsmsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                Send Test
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
                <span>{formatDateTime(vonageConfigData.lastTestedAt)}</span>
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
                  onClick={() => {
                    const shouldAutoEnable = !isConfigured && (vonageApiKey || vonageApiSecret || vonageFromNumber);
                    const enabled = shouldAutoEnable ? true : vonageEnabled;
                    if (shouldAutoEnable) setVonageEnabled(true);
                    saveVonageConfigMutation.mutate({
                      apiKey: vonageApiKey || undefined,
                      apiSecret: vonageApiSecret || undefined,
                      fromNumber: vonageFromNumber || undefined,
                      isEnabled: enabled,
                    });
                  }}
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

// TARDOC Catalog Integration Card
function TardocIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: tardocStatus, isLoading: tardocStatusLoading, refetch: refetchTardocStatus } = useQuery<{
    count: number;
    version: string | null;
  }>({
    queryKey: ['/api/tardoc/catalog-status'],
    retry: false,
    staleTime: 0,
  });

  const importTardocMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/${hospitalId}/import-tardoc-remote`, {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'TARDOC Import Successful',
        description: data.message,
      });
      refetchTardocStatus();
    },
    onError: (error: any) => {
      toast({
        title: 'TARDOC Import Failed',
        description: error.message || 'Failed to import TARDOC catalog',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">
              TARDOC {tardocStatus?.version || '1.4c'} Catalog
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('admin.tardocDescription', 'Swiss tariff codes for insurance billing.')}
              {' '}
              <a
                href="https://oaat-otma.ch/gesamt-tarifsystem/vertraege-und-anhaenge"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-xs"
              >
                oaat-otma.ch
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {tardocStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (tardocStatus?.count ?? 0) > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {(tardocStatus?.count ?? 0).toLocaleString()} positions
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">
                  {t('admin.tardocNotImported', 'Not imported')}
                </span>
              </>
            )}
          </div>

          <Button
            onClick={() => importTardocMutation.mutate()}
            disabled={importTardocMutation.isPending || !hospitalId}
            size="sm"
            data-testid="button-import-tardoc"
          >
            {importTardocMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('admin.importing', 'Importing...')}
              </>
            ) : (tardocStatus?.count ?? 0) > 0 ? (
              t('admin.updateCatalog', 'Update Catalog')
            ) : (
              t('admin.importTardoc', 'Import TARDOC')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Ambulante Pauschalen Integration Card
function ApIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { toast } = useToast();

  const { data: apStatus, isLoading: apStatusLoading, refetch: refetchApStatus } = useQuery<{
    count: number;
    version: string | null;
  }>({
    queryKey: ['/api/tardoc/ap-catalog-status'],
    retry: false,
    staleTime: 0,
  });

  const importApMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/${hospitalId}/import-ap-remote`, {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: 'AP Import Successful', description: data.message });
      refetchApStatus();
    },
    onError: (error: any) => {
      toast({
        title: 'AP Import Failed',
        description: error.message || 'Failed to import AP catalog',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">
              Ambulante Pauschalen {apStatus?.version || '1.1c'} Catalog
            </h3>
            <p className="text-sm text-muted-foreground">
              Swiss flat-rate outpatient billing codes.{' '}
              <a href="https://oaat-otma.ch/gesamt-tarifsystem/vertraege-und-anhaenge" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                oaat-otma.ch
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {apStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (apStatus?.count ?? 0) > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {(apStatus?.count ?? 0).toLocaleString()} positions
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">Not imported</span>
              </>
            )}
          </div>

          <Button
            onClick={() => importApMutation.mutate()}
            disabled={importApMutation.isPending || !hospitalId}
            size="sm"
          >
            {importApMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (apStatus?.count ?? 0) > 0 ? (
              'Update Catalog'
            ) : (
              'Import AP Catalog'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// TARDOC Cumulation/Exclusion Rules Import Card
function CumulationRulesCard({ hospitalId }: { hospitalId?: string }) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: rulesStatus, isLoading, refetch } = useQuery<{ count: number }>({
    queryKey: ['/api/tardoc/cumulation-rules-status'],
    retry: false,
    staleTime: 0,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiRequest('POST', `/api/admin/${hospitalId}/import-cumulation-rules`, {
        fileContent: base64,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: 'Rules Imported', description: data.message });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import rules',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">TARDOC Cumulation / Exclusion Rules</h3>
            <p className="text-sm text-muted-foreground">
              Advisory warnings for conflicting TARDOC codes on invoices
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (rulesStatus?.count ?? 0) > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {(rulesStatus?.count ?? 0).toLocaleString()} rules
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No rules loaded</span>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending || !hospitalId}
            size="sm"
            variant="outline"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (rulesStatus?.count ?? 0) > 0 ? (
              'Update Rules'
            ) : (
              'Import Rules'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// TPW Rates Management Card
const SWISS_CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
  "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
  "TI", "UR", "VD", "VS", "ZG", "ZH"
];

interface TpwRate {
  id: string;
  canton: string;
  insurerGln: string | null;
  lawType: string | null;
  tpValueAl: string | null;
  tpValueTl: string | null;
  tpValue: string;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
}

function TpwRatesCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = React.useState(false);
  const [newRate, setNewRate] = React.useState({
    canton: '', tpValue: '', validFrom: new Date().toISOString().split('T')[0],
    validTo: '', insurerGln: '', lawType: '', notes: '',
  });

  const { data: rates = [], isLoading } = useQuery<TpwRate[]>({
    queryKey: [`/api/clinic/${hospitalId}/tpw-rates`],
    enabled: !!hospitalId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newRate) => {
      const res = await apiRequest('POST', `/api/clinic/${hospitalId}/tpw-rates`, {
        ...data,
        insurerGln: data.insurerGln || null,
        lawType: data.lawType || null,
        validTo: data.validTo || null,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tpw-rates`] });
      toast({ title: 'TPW rate added' });
      setIsAdding(false);
      setNewRate({ canton: '', tpValue: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', insurerGln: '', lawType: '', notes: '' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/clinic/${hospitalId}/tpw-rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tpw-rates`] });
      toast({ title: 'TPW rate deleted' });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">TPW Rates (Taxpunktwert)</h3>
            <p className="text-sm text-muted-foreground">
              Canton/insurer-specific tax point values for TARDOC billing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{rates.length} rate{rates.length !== 1 ? 's' : ''}</span>
          <Button size="sm" onClick={() => setIsAdding(!isAdding)} disabled={!hospitalId}>
            <Plus className="h-4 w-4 mr-1" /> Add Rate
          </Button>
        </div>
      </div>

      {isAdding && (
        <div className="border rounded p-3 mb-3 bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs font-medium">Canton *</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.canton}
                onChange={e => setNewRate(r => ({ ...r, canton: e.target.value }))}
              >
                <option value="">Select...</option>
                {SWISS_CANTONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">TP Value (CHF) *</label>
              <input
                type="number"
                step="0.0001"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.tpValue}
                onChange={e => setNewRate(r => ({ ...r, tpValue: e.target.value }))}
                placeholder="e.g. 0.8300"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Valid From *</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.validFrom}
                onChange={e => setNewRate(r => ({ ...r, validFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Valid To</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.validTo}
                onChange={e => setNewRate(r => ({ ...r, validTo: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium">Insurer GLN</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.insurerGln}
                onChange={e => setNewRate(r => ({ ...r, insurerGln: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Law Type</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.lawType}
                onChange={e => setNewRate(r => ({ ...r, lawType: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="KVG">KVG</option>
                <option value="UVG">UVG</option>
                <option value="IVG">IVG</option>
                <option value="MVG">MVG</option>
                <option value="VVG">VVG</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.notes}
                onChange={e => setNewRate(r => ({ ...r, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(newRate)}
              disabled={!newRate.canton || !newRate.tpValue || !newRate.validFrom || createMutation.isPending}
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : rates.length > 0 ? (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Canton</th>
                <th className="text-left px-3 py-1.5 font-medium">TP Value</th>
                <th className="text-left px-3 py-1.5 font-medium">Law</th>
                <th className="text-left px-3 py-1.5 font-medium">Insurer</th>
                <th className="text-left px-3 py-1.5 font-medium">Valid</th>
                <th className="text-left px-3 py-1.5 font-medium">Notes</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map(rate => (
                <tr key={rate.id} className="border-t">
                  <td className="px-3 py-1.5 font-mono">{rate.canton}</td>
                  <td className="px-3 py-1.5 font-mono">{rate.tpValue}</td>
                  <td className="px-3 py-1.5">{rate.lawType || 'Any'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{rate.insurerGln || '-'}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {rate.validFrom}{rate.validTo ? ` → ${rate.validTo}` : ' →'}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{rate.notes || '-'}</td>
                  <td className="px-2 py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => deleteMutation.mutate(rate.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No TPW rates configured. The hospital default TP value will be used for all invoices.
        </p>
      )}
    </div>
  );
}

// CHOP Procedures Integration Card
function ChopIntegrationCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  // Check CHOP import status
  const { data: chopStatus, isLoading: chopStatusLoading, isError: chopStatusError, refetch: refetchChopStatus } = useQuery<{
    imported: boolean;
    count: number;
  }>({
    queryKey: ['/api/tardoc/chop-status'],
    retry: false,
    staleTime: 0,
  });
  
  // CHOP import mutation
  const importChopMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/import-chop');
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: t('admin.chopImportSuccess', 'CHOP Import Successful'),
        description: data.message,
      });
      refetchChopStatus();
    },
    onError: (error: any) => {
      toast({
        title: t('admin.chopImportError', 'CHOP Import Failed'),
        description: error.message || 'Failed to import CHOP procedures',
        variant: 'destructive',
      });
    },
  });
  
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">{t('admin.chopProcedures', 'CHOP 2026 Procedures')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('admin.chopDescription', 'Swiss procedure codes for TARDOC billing')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {chopStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : chopStatus?.imported ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {chopStatus.count.toLocaleString()} {t('admin.proceduresImported', 'procedures')}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">
                  {t('admin.chopNotImported', 'Not imported')}
                </span>
              </>
            )}
          </div>
          
          <Button
            onClick={() => importChopMutation.mutate()}
            disabled={importChopMutation.isPending || chopStatus?.imported}
            size="sm"
            data-testid="button-import-chop"
          >
            {importChopMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('admin.importing', 'Importing...')}
              </>
            ) : chopStatus?.imported ? (
              t('admin.alreadyImported', 'Imported')
            ) : (
              t('admin.importChop', 'Import CHOP')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Booking Token Management Section ───────────────────────────

function BookingTokenSection({ hospitalId, isAdmin }: { hospitalId: string | undefined; isAdmin: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedProviderId, setCopiedProviderId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showProviderLinks, setShowProviderLinks] = useState(false);
  const [slotDuration, setSlotDuration] = useState<string>("30");
  const [maxDays, setMaxDays] = useState<string>("90");
  const [minHours, setMinHours] = useState<string>("2");

  const { data: tokenData } = useQuery<{ bookingToken: string | null; bookingSettings: any }>({
    queryKey: [`/api/admin/${hospitalId}/booking-token`],
    enabled: !!hospitalId && isAdmin,
  });

  // Fetch bookable providers to show per-provider links
  const { data: bookableProviders } = useQuery<any[]>({
    queryKey: [`/api/clinic/${hospitalId}/bookable-providers`],
    enabled: !!hospitalId && isAdmin && !!tokenData?.bookingToken,
  });

  useEffect(() => {
    if (tokenData?.bookingSettings) {
      const s = tokenData.bookingSettings;
      if (s.slotDurationMinutes) setSlotDuration(String(s.slotDurationMinutes));
      if (s.maxAdvanceDays) setMaxDays(String(s.maxAdvanceDays));
      if (s.minAdvanceHours) setMinHours(String(s.minAdvanceHours));
    }
  }, [tokenData?.bookingSettings]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/${hospitalId}/booking-token/generate`, {});
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Booking link generated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/${hospitalId}/booking-token`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Booking link disabled" });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/${hospitalId}/booking-settings`, {
        slotDurationMinutes: parseInt(slotDuration) || 30,
        maxAdvanceDays: parseInt(maxDays) || 90,
        minAdvanceHours: parseInt(minHours) || 2,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${hospitalId}/booking-token`] });
      toast({ title: t("common.success"), description: "Settings saved" });
      setShowSettings(false);
    },
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const bookingUrl = tokenData?.bookingToken ? `${baseUrl}/book/${tokenData.bookingToken}` : null;

  const handleCopy = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              Patient Booking Page
            </h3>
            <p className="text-sm text-muted-foreground">
              Public booking page where patients can schedule appointments with bookable providers
            </p>
          </div>
        </div>

        {tokenData?.bookingToken ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Input
                value={bookingUrl || ""}
                readOnly
                className="flex-1 bg-background text-sm font-mono"
              />
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <RefreshCw className="h-4 w-4 mr-2" />}
                Regenerate Link
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Are you sure you want to disable the booking link? Patients won't be able to book appointments online.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <Trash2 className="h-4 w-4 mr-2" />}
                Disable Link
              </Button>
            </div>

            {/* Settings panel */}
            {showSettings && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
                <h4 className="text-sm font-medium">Booking Settings</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Slot Duration (min)</Label>
                    <Input
                      type="number"
                      value={slotDuration}
                      onChange={(e) => setSlotDuration(e.target.value)}
                      min={5}
                      max={120}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Advance (days)</Label>
                    <Input
                      type="number"
                      value={maxDays}
                      onChange={(e) => setMaxDays(e.target.value)}
                      min={1}
                      max={365}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Advance (hours)</Label>
                    <Input
                      type="number"
                      value={minHours}
                      onChange={(e) => setMinHours(e.target.value)}
                      min={0}
                      max={168}
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
                  {saveSettingsMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  Save Settings
                </Button>
              </div>
            )}

            {/* Per-provider direct links */}
            {bookableProviders && bookableProviders.length > 0 && (
              <div>
                <button
                  onClick={() => setShowProviderLinks(!showProviderLinks)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  {showProviderLinks ? "▾" : "▸"} Direct links per provider ({bookableProviders.length})
                </button>
                {showProviderLinks && (
                  <div className="mt-2 space-y-2">
                    {bookableProviders.map((p: any) => {
                      const providerUrl = `${bookingUrl}?provider=${p.userId}`;
                      const isCopied = copiedProviderId === p.userId;
                      return (
                        <div key={p.userId} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium min-w-[140px] truncate">
                            {p.user?.firstName} {p.user?.lastName}
                          </span>
                          <Input
                            value={providerUrl}
                            readOnly
                            className="flex-1 bg-background text-xs font-mono h-8"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(providerUrl);
                                setCopiedProviderId(p.userId);
                                setTimeout(() => setCopiedProviderId(null), 2000);
                              } catch { /* ignore */ }
                            }}
                          >
                            {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              No booking link has been generated yet.
            </p>
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <i className="fas fa-spinner fa-spin mr-2"></i> : <LinkIcon className="h-4 w-4 mr-2" />}
              Generate Link
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
