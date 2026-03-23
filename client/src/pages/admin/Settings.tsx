import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check, Link as LinkIcon, RefreshCw, Trash2, Settings, Download, Loader2, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateLong } from "@/lib/dateUtils";
import { generateQuestionnairePosterPdf } from "@/lib/questionnairePosterPdf";
import QRCode from "qrcode";
import { LoginAuditLogTab } from "./LoginAuditLog";
import { BookingTokenSection } from "./components/BookingTokenSection";

export default function SettingsPage() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Check if user is admin
  const isAdmin = activeHospital?.role === "admin";

  // Internal tab state
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const validTabs = ["settings", "links", "data", "security", "experimental"];
  const [activeTab, setActiveTab] = useState<"settings" | "links" | "data" | "security" | "experimental">(
    urlTab && validTabs.includes(urlTab) ? urlTab as any : "settings"
  );

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
    noShowFeeMessage: "" as string,
    addonPatientChat: false,
    currency: "CHF" as string,
    dateFormat: "european" as string,
    hourFormat: "24h" as string,
    timezone: "Europe/Zurich" as string,
    defaultLanguage: "de" as string,
  });
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Closures management state
  const [closureDialogOpen, setClosureDialogOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<any | null>(null);
  const [closureForm, setClosureForm] = useState({ name: '', startDate: '', endDate: '', notes: '' });
  const [deleteClosureId, setDeleteClosureId] = useState<string | null>(null);

  // Seed data states
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [resetListsDialogOpen, setResetListsDialogOpen] = useState(false);
  const [resetListsConfirmText, setResetListsConfirmText] = useState("");

  // Link copy states
  const [linkCopied, setLinkCopied] = useState(false);
  const [externalSurgeryLinkCopied, setExternalSurgeryLinkCopied] = useState(false);
  const [kioskLinkCopied, setKioskLinkCopied] = useState(false);

  // External surgery notification email state
  const [notificationEmail, setNotificationEmail] = useState('');

  // --- Queries ---

  // Fetch full hospital data
  const { data: fullHospitalData } = useQuery<any>({
    queryKey: [`/api/admin/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  // Closures
  const { data: closures = [], isLoading: closuresLoading } = useQuery<any[]>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/closures`],
    enabled: !!activeHospital?.id,
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

  // --- Effects ---

  // Sync notification email from query data
  useEffect(() => {
    setNotificationEmail(externalSurgeryTokenData?.notificationEmail || '');
  }, [externalSurgeryTokenData?.notificationEmail]);

  // Initialize form when hospital data is loaded
  useEffect(() => {
    if (fullHospitalData) {
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
        noShowFeeMessage: fullHospitalData.noShowFeeMessage || "",
        addonPatientChat: fullHospitalData.addonPatientChat ?? false,
        currency: fullHospitalData.currency || "CHF",
        dateFormat: fullHospitalData.dateFormat || "european",
        hourFormat: fullHospitalData.hourFormat || "24h",
        timezone: fullHospitalData.timezone || "Europe/Zurich",
        defaultLanguage: fullHospitalData.defaultLanguage || "de",
      });
    }
  }, [fullHospitalData]);

  // --- Mutations ---

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

  const updateNoShowFeeMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("PATCH", `/api/admin/${activeHospital?.id}`, { noShowFeeMessage: message || null });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: t("common.success"),
        description: t("admin.noShowFeeMessageSaved", "No-show fee notice saved"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Closure mutations
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

  // Seed hospital mutation
  const seedHospitalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/hospitals/${activeHospital?.id}/seed`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${activeHospital?.id}`] });
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

  // --- Handler functions ---

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
    } catch {
      toast({ title: t("common.error"), description: t("admin.failedToUploadLogo"), variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // URL helpers
  const getQuestionnaireUrl = () => {
    if (!questionnaireTokenData?.questionnaireToken) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/questionnaire/hospital/${questionnaireTokenData.questionnaireToken}`;
  };

  const getExternalSurgeryUrl = () => {
    if (!externalSurgeryTokenData?.token) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/external-surgery/${externalSurgeryTokenData.token}`;
  };

  const getKioskUrl = () => {
    if (!kioskTokenData?.kioskToken) return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}/kiosk/${kioskTokenData.kioskToken}`;
  };

  const downloadQrCode = async (url: string, filename: string) => {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      width: 400,
      margin: 2,
    });
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
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

  const handleCopyExternalSurgeryLink = async () => {
    const url = getExternalSurgeryUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setExternalSurgeryLinkCopied(true);
        toast({ title: t("common.success"), description: t("admin.linkCopied", "Link copied to clipboard") });
        setTimeout(() => setExternalSurgeryLinkCopied(false), 2000);
      } catch {
        toast({ title: t("common.error"), description: t("admin.failedToCopy", "Failed to copy link"), variant: "destructive" });
      }
    }
  };

  const handleCopyKioskLink = async () => {
    const url = getKioskUrl();
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setKioskLinkCopied(true);
        toast({ title: t("common.success"), description: t("admin.linkCopied", "Link copied to clipboard") });
        setTimeout(() => setKioskLinkCopied(false), 2000);
      } catch {
        toast({ title: t("common.error"), description: t("admin.failedToCopy", "Failed to copy link"), variant: "destructive" });
      }
    }
  };

  // --- Guards ---

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
        <h1 className="text-2xl font-bold text-foreground">{t("admin.settings", "Settings")}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Vertical sidebar nav */}
          <TabsList className="flex flex-row md:flex-col h-auto w-full md:w-52 shrink-0 justify-start overflow-x-auto md:overflow-x-visible scrollbar-hide bg-muted/50 md:bg-transparent p-1 md:p-0 md:gap-1">
            <TabsTrigger value="settings" data-testid="tab-settings" className="justify-start md:w-full">
              <Settings className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t("admin.settings", "Settings")}</span>
            </TabsTrigger>
            <TabsTrigger value="links" data-testid="tab-links" className="justify-start md:w-full">
              <i className="fas fa-link mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.links", "Links")}</span>
            </TabsTrigger>
            <TabsTrigger value="data" data-testid="tab-data" className="justify-start md:w-full">
              <i className="fas fa-database mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.data", "Data")}</span>
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

        {/* Settings Tab Content -- with horizontal sub-tabs */}
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

          {/* No-Show Fee Notice Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <i className="fas fa-exclamation-triangle text-amber-500"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-lg">
                    {t("admin.noShowFeeNotice", "No-Show Fee Notice")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.noShowFeeNoticeDescription", "When set, patients must acknowledge this message when booking online. It is also included in the 24h appointment reminder. Leave empty to disable.")}
                  </p>
                </div>
              </div>
              {hospitalForm.noShowFeeMessage && hospitalForm.appointmentReminderDisabled && (
                <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-md p-3">
                  <i className="fas fa-info-circle mr-1"></i>
                  {t("admin.noShowFeeReminderWarning", "Note: Appointment reminders are currently disabled — the fee notice will only appear during booking, not in reminders.")}
                </div>
              )}
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={hospitalForm.defaultLanguage === "en"
                  ? "Please note that appointments not cancelled at least 24 hours in advance may be subject to a CHF 150 fee."
                  : "Bitte beachten Sie, dass Termine, die nicht mindestens 24 Stunden im Voraus abgesagt werden, mit CHF 150 in Rechnung gestellt werden können."}
                value={hospitalForm.noShowFeeMessage}
                onChange={(e) => setHospitalForm(prev => ({ ...prev, noShowFeeMessage: e.target.value }))}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("admin.noShowFeeSmsNote", "Note: Long messages may be sent as multiple SMS segments, increasing costs.")}
                </p>
                <Button
                  size="sm"
                  onClick={() => updateNoShowFeeMessageMutation.mutate(hospitalForm.noShowFeeMessage)}
                  disabled={updateNoShowFeeMessageMutation.isPending}
                >
                  {updateNoShowFeeMessageMutation.isPending
                    ? t("common.saving", "Saving...")
                    : t("common.save", "Save")}
                </Button>
              </div>
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = getExternalSurgeryUrl();
                        if (url) downloadQrCode(url, 'external-surgery-qr-code.png');
                      }}
                      data-testid="button-download-external-surgery-qr"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t("admin.downloadQrCode", "Download QR Code")}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = getKioskUrl();
                        if (url) downloadQrCode(url, 'kiosk-qr-code.png');
                      }}
                      data-testid="button-download-kiosk-qr"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t("admin.downloadQrCode", "Download QR Code")}
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

        {/* Security Tab Content */}
        <TabsContent value="security">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">{t("admin.loginHistory", "Login History")}</h3>
            <LoginAuditLogTab hospitalId={activeHospital?.id} />
          </div>
        </TabsContent>

        {/* Experimental Tab Content */}
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
                <DateInput
                  value={closureForm.startDate}
                  onChange={(isoDate) => {
                    setClosureForm({
                      ...closureForm,
                      startDate: isoDate,
                      endDate: closureForm.endDate && closureForm.endDate < isoDate ? isoDate : closureForm.endDate,
                    });
                  }}
                  placeholder={t("admin.pickDate", "Pick date")}
                />
              </div>
              <div>
                <Label>{t("admin.endDate", "End Date")} *</Label>
                <DateInput
                  value={closureForm.endDate}
                  onChange={(isoDate) => setClosureForm({ ...closureForm, endDate: isoDate })}
                  min={closureForm.startDate || undefined}
                  placeholder={t("admin.pickDate", "Pick date")}
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

      {/* Seed Confirmation Dialog */}
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
