import React, { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Plus, Edit, Trash2, Wifi, WifiOff, Copy, Check, RefreshCw, Loader2, CheckCircle2, AlertCircle, Database, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { formatDateTime, formatCurrency } from "@/lib/dateUtils";
import { Link } from "wouter";
import type { CameraDevice } from "@shared/schema";

import { SmsProviderSelector } from "./components/SmsProviderSelector";
import { AspsmsIntegrationCard } from "./components/AspsmsIntegrationCard";
import { TardocIntegrationCard } from "./components/TardocIntegrationCard";
import { ChopIntegrationCard } from "./components/ChopIntegrationCard";
import { ApIntegrationCard } from "./components/ApIntegrationCard";
import { CumulationRulesCard } from "./components/CumulationRulesCard";
import { TpwRatesCard } from "./components/TpwRatesCard";
import { VisionAiProviderCard } from "./components/VisionAiProviderCard";
import { CardReaderTab } from "./components/CardReaderTab";

export default function Integrations() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [activeTab, setActiveTab] = useState<"galexis" | "sms" | "cameras" | "cardreader" | "tardoc">("galexis");

  const isAdmin = activeHospital?.role === "admin";

  // ── TARDOC Billing Identifiers state ─────────────────────────────────
  const [billingForm, setBillingForm] = useState({
    companyGln: "",
    companyZsr: "",
    defaultTpValue: "",
    companyBankIban: "",
    companyBankName: "",
  });

  const { data: hospitalData } = useQuery<any>({
    queryKey: [`/api/admin/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin && activeTab === "tardoc",
  });

  useEffect(() => {
    if (hospitalData) {
      setBillingForm({
        companyGln: hospitalData.companyGln || "",
        companyZsr: hospitalData.companyZsr || "",
        defaultTpValue: hospitalData.defaultTpValue || "",
        companyBankIban: hospitalData.companyBankIban || "",
        companyBankName: hospitalData.companyBankName || "",
      });
    }
  }, [hospitalData]);

  const updateBillingMutation = useMutation({
    mutationFn: async (data: typeof billingForm) => {
      const res = await apiRequest("PATCH", `/api/admin/${activeHospital!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}`] });
      toast({ title: t("common.success"), description: t("admin.billingIdsSaved", "Billing identifiers saved") });
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("admin.billingIdsSaveFailed", "Failed to save billing identifiers"), variant: "destructive" });
    },
  });

  // ── Galexis state ──────────────────────────────────────────────────────

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplierName: "Galexis",
    supplierType: "api" as "api" | "database",
    customerNumber: "",
    apiPassword: "",
  });

  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [catalogPreview, setCatalogPreview] = useState<{ headers: string[]; sampleRows: any[][]; totalRows: number } | null>(null);
  const [catalogMapping, setCatalogMapping] = useState<Record<string, number | undefined>>({});
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogParsing, setCatalogParsing] = useState(false);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  const [galexisDebugQuery, setGalexisDebugQuery] = useState("");
  const [galexisDebugResult, setGalexisDebugResult] = useState<any>(null);
  const [galexisDebugLoading, setGalexisDebugLoading] = useState(false);

  const { data: catalogStatus, isLoading: catalogStatusLoading, refetch: refetchCatalogStatus } = useQuery<{
    articlesCount: number;
    lastUpdated: string | null;
  }>({
    queryKey: ['/api/admin/catalog/status'],
    enabled: activeTab === 'galexis',
  });

  const { data: supplierCatalogs = [], isLoading: catalogsLoading } = useQuery<any[]>({
    queryKey: [`/api/supplier-catalogs/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  const { data: priceSyncJobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery<any[]>({
    queryKey: [`/api/price-sync-jobs/${activeHospital?.id}`],
    enabled: !!activeHospital?.id && isAdmin,
  });

  const hasActiveJob = Array.isArray(priceSyncJobs) && priceSyncJobs.some((j: any) => j.status === 'queued' || j.status === 'processing');

  useEffect(() => {
    if (!hasActiveJob) return;
    const interval = setInterval(() => {
      refetchJobs();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasActiveJob, refetchJobs]);

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

  const handleGalexisDebugSearch = async () => {
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
  };

  // ── Camera state ───────────────────────────────────────────────────────

  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<CameraDevice | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDevice, setDeletingDevice] = useState<CameraDevice | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cameraForm, setCameraForm] = useState({ cameraId: "", name: "" });

  const { data: devices = [], isLoading: devicesLoading, refetch: refetchDevices } = useQuery<CameraDevice[]>({
    queryKey: ["/api/camera-devices", activeHospital?.id],
    queryFn: async () => {
      const res = await fetch(`/api/camera-devices?hospitalId=${activeHospital?.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeHospital?.id && isAdmin,
    refetchInterval: 30000,
  });

  const createCameraMutation = useMutation({
    mutationFn: async (data: { hospitalId: string; cameraId: string; name: string; location?: string }) => {
      const res = await apiRequest("POST", "/api/camera-devices", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create camera device");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/camera-devices", activeHospital?.id] });
      setCameraDialogOpen(false);
      setCameraForm({ cameraId: "", name: "" });
      toast({
        title: t("admin.cameraDevices.created", "Camera device created"),
        description: t("admin.cameraDevices.createdDescription", "The camera device has been registered successfully."),
      });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const updateCameraMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; location?: string } }) => {
      const res = await apiRequest("PATCH", `/api/camera-devices/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update camera device");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/camera-devices", activeHospital?.id] });
      setCameraDialogOpen(false);
      setEditingDevice(null);
      setCameraForm({ cameraId: "", name: "" });
      toast({ title: t("admin.cameraDevices.updated", "Camera device updated") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteCameraMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/camera-devices/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete camera device");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/camera-devices", activeHospital?.id] });
      setDeleteDialogOpen(false);
      setDeletingDevice(null);
      toast({ title: t("admin.cameraDevices.deleted", "Camera device deleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("common.error", "Error"), description: error.message, variant: "destructive" });
    },
  });

  const handleOpenCreateCamera = () => {
    setEditingDevice(null);
    setCameraForm({ cameraId: "", name: "" });
    setCameraDialogOpen(true);
  };

  const handleOpenEditCamera = (device: CameraDevice) => {
    setEditingDevice(device);
    setCameraForm({ cameraId: device.cameraId, name: device.name });
    setCameraDialogOpen(true);
  };

  const handleOpenDeleteCamera = (device: CameraDevice) => {
    setDeletingDevice(device);
    setDeleteDialogOpen(true);
  };

  const handleCameraSubmit = () => {
    if (editingDevice) {
      updateCameraMutation.mutate({ id: editingDevice.id, data: { name: cameraForm.name } });
    } else {
      if (!cameraForm.cameraId.trim() || !cameraForm.name.trim()) {
        toast({
          title: t("common.error", "Error"),
          description: t("admin.cameraDevices.requiredFields", "Camera ID and Name are required"),
          variant: "destructive",
        });
        return;
      }
      createCameraMutation.mutate({
        hospitalId: activeHospital?.id || "",
        cameraId: cameraForm.cameraId.trim(),
        name: cameraForm.name.trim(),
      });
    }
  };

  const handleCopyId = (cameraId: string) => {
    navigator.clipboard.writeText(cameraId);
    setCopiedId(cameraId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isOnline = (lastSeenAt: Date | null) => {
    if (!lastSeenAt) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastSeenAt) > fiveMinutesAgo;
  };

  // ── Guard ──────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("common.accessDenied", "Access denied")}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("admin.integrations", "Integrations")}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Vertical sidebar nav */}
          <TabsList className="flex flex-row md:flex-col h-auto w-full md:w-52 shrink-0 justify-start overflow-x-auto md:overflow-x-visible scrollbar-hide bg-muted/50 md:bg-transparent p-1 md:p-0 md:gap-1">
            <TabsTrigger value="galexis" data-testid="tab-galexis" className="justify-start md:w-full">
              <i className="fas fa-truck mr-2 shrink-0"></i>
              <span className="truncate">Galexis</span>
            </TabsTrigger>
            <TabsTrigger value="sms" data-testid="tab-sms" className="justify-start md:w-full">
              <i className="fas fa-comment-sms mr-2 shrink-0"></i>
              <span className="truncate">SMS</span>
            </TabsTrigger>
            <TabsTrigger value="cameras" data-testid="tab-cameras" className="justify-start md:w-full">
              <Camera className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t("admin.devices.camerasTab", "Cameras")}</span>
            </TabsTrigger>
            <TabsTrigger value="cardreader" data-testid="tab-cardreader" className="justify-start md:w-full">
              <i className="fas fa-credit-card mr-2 shrink-0"></i>
              <span className="truncate">{t("admin.cardReaderTitle", "Card Reader")}</span>
            </TabsTrigger>
            <TabsTrigger value="tardoc" data-testid="tab-tardoc" className="justify-start md:w-full">
              <i className="fas fa-file-invoice mr-2 shrink-0"></i>
              <span className="truncate">TARDOC</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab content area */}
          <div className="flex-1 min-w-0">

        {/* ── Tab 1: Galexis ────────────────────────────────────────────── */}
        <TabsContent value="galexis">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">Galexis Price Sync</h2>
            <Button
              onClick={() => setSupplierDialogOpen(true)}
              size="sm"
              data-testid="button-configure-galexis"
            >
              <i className="fas fa-plus mr-2"></i>
              Configure Galexis
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
                  Connect your Galexis account to automatically sync current prices for your inventory items.
                  Supports Galexis XML API with customer-specific pricing.
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
              <h3 className="text-lg font-semibold text-foreground mb-2">No Galexis Configuration</h3>
              <p className="text-muted-foreground mb-4">
                Configure your Galexis account to enable automatic price syncing
              </p>
              <Button onClick={() => setSupplierDialogOpen(true)} size="sm">
                <i className="fas fa-plus mr-2"></i>
                Configure Galexis
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
                          <p className="text-sm text-muted-foreground mt-1">
                            <i className="fas fa-globe mr-1"></i>
                            Account: {catalog.browserUsername || 'Not configured'}
                          </p>
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

                    {/* Galexis API Test Lookup */}
                    {isGalexis && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Test lookup (pharmacode or GTIN)..."
                            value={galexisDebugQuery}
                            onChange={(e) => setGalexisDebugQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && galexisDebugQuery.trim()) {
                                handleGalexisDebugSearch();
                              }
                            }}
                            className="flex-1"
                            data-testid="input-galexis-lookup"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGalexisDebugSearch}
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
                                  Pharmacode: {galexisDebugResult.pharmacode || 'N/A'} |{' '}
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

        {/* ── Tab 2: SMS ────────────────────────────────────────────────── */}
        <TabsContent value="sms">
          <div className="space-y-4">
            <SmsProviderSelector hospitalId={activeHospital?.id} />
            <AspsmsIntegrationCard hospitalId={activeHospital?.id} />
          </div>
        </TabsContent>

        {/* ── Tab 3: Cameras ────────────────────────────────────────────── */}
        <TabsContent value="cameras">
          <div className="space-y-6">
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="icon" onClick={() => refetchDevices()} data-testid="button-refresh-cameras">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={handleOpenCreateCamera} data-testid="button-add-camera">
                <Plus className="h-4 w-4 mr-2" />
                {t("admin.cameraDevices.addDevice", "Add Camera")}
              </Button>
            </div>

            {devicesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : devices.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Camera className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {t("admin.cameraDevices.noDevices", "No camera devices registered")}
                  </h3>
                  <p className="text-muted-foreground text-center max-w-md mb-4">
                    {t("admin.cameraDevices.noDevicesDescription", "Register your Raspberry Pi camera devices to enable automated vital signs capture during anesthesia cases.")}
                  </p>
                  <Button onClick={handleOpenCreateCamera}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("admin.cameraDevices.addFirstDevice", "Add your first camera")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {devices.map((device) => (
                  <Card key={device.id} data-testid={`card-camera-${device.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {isOnline(device.lastSeenAt) ? (
                            <Badge variant="default" className="bg-green-500">
                              <Wifi className="h-3 w-3 mr-1" />
                              {t("admin.cameraDevices.online", "Online")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <WifiOff className="h-3 w-3 mr-1" />
                              {t("admin.cameraDevices.offline", "Offline")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditCamera(device)} data-testid={`button-edit-camera-${device.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDeleteCamera(device)} data-testid={`button-delete-camera-${device.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <CardTitle className="text-lg">{device.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("admin.cameraDevices.cameraId", "Camera ID")}:</span>
                        <div className="flex items-center gap-1">
                          <code className="bg-muted px-2 py-0.5 rounded text-xs">{device.cameraId}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopyId(device.cameraId)}
                            data-testid={`button-copy-cameraid-${device.id}`}
                          >
                            {copiedId === device.cameraId ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {device.lastSeenAt && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t("admin.cameraDevices.lastSeen", "Last seen")}:</span>
                          <span>{formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Vision AI Provider Selection */}
            <VisionAiProviderCard hospitalId={activeHospital?.id} currentProvider={activeHospital?.visionAiProvider} />
          </div>
        </TabsContent>

        {/* ── Tab 4: Card Reader ────────────────────────────────────────── */}
        <TabsContent value="cardreader">
          <CardReaderTab hospitalId={activeHospital?.id} />
        </TabsContent>

        {/* ── Tab 5: TARDOC ─────────────────────────────────────────────── */}
        <TabsContent value="tardoc">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">TARDOC</h2>
              <p className="text-sm text-muted-foreground">{t("admin.tardocTabDescription", "Swiss tariff catalogs, procedure codes, and billing configuration.")}</p>
            </div>

            {/* TARDOC Billing Identifiers */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="font-medium mb-3">{t("admin.tardocBillingIds", "Billing Identifiers")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="tardoc-gln">GLN</Label>
                  <Input
                    id="tardoc-gln"
                    value={billingForm.companyGln}
                    onChange={(e) => setBillingForm(prev => ({ ...prev, companyGln: e.target.value }))}
                    placeholder="7601000000000"
                    maxLength={13}
                  />
                  <p className="text-xs text-muted-foreground mt-1">13-digit Global Location Number</p>
                </div>
                <div>
                  <Label htmlFor="tardoc-zsr">ZSR</Label>
                  <Input
                    id="tardoc-zsr"
                    value={billingForm.companyZsr}
                    onChange={(e) => setBillingForm(prev => ({ ...prev, companyZsr: e.target.value }))}
                    placeholder="Z123456"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-3">
                <div>
                  <Label htmlFor="tardoc-tp">{t("admin.defaultTpValue", "Default TP Value")}</Label>
                  <Input
                    id="tardoc-tp"
                    value={billingForm.defaultTpValue}
                    onChange={(e) => setBillingForm(prev => ({ ...prev, defaultTpValue: e.target.value }))}
                    placeholder="1.0000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">CHF per tax point</p>
                </div>
                <div>
                  <Label htmlFor="tardoc-iban">IBAN</Label>
                  <Input
                    id="tardoc-iban"
                    value={billingForm.companyBankIban}
                    onChange={(e) => setBillingForm(prev => ({ ...prev, companyBankIban: e.target.value }))}
                    placeholder="CH93 0076 2011 6238 5295 7"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.ibanHint", "For QR-bill on Tiers Garant invoices")}</p>
                </div>
                <div>
                  <Label htmlFor="tardoc-bank">{t("admin.bankName", "Bank")}</Label>
                  <Input
                    id="tardoc-bank"
                    value={billingForm.companyBankName}
                    onChange={(e) => setBillingForm(prev => ({ ...prev, companyBankName: e.target.value }))}
                    placeholder="UBS Switzerland AG"
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  onClick={() => updateBillingMutation.mutate(billingForm)}
                  disabled={updateBillingMutation.isPending}
                >
                  {updateBillingMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("common.saving", "Saving...")}</>
                  ) : (
                    <>{t("common.save", "Save")}</>
                  )}
                </Button>
              </div>
            </div>

            <TardocIntegrationCard hospitalId={activeHospital?.id} />
            <ChopIntegrationCard />
            <ApIntegrationCard hospitalId={activeHospital?.id} />
            <CumulationRulesCard hospitalId={activeHospital?.id} />
            <TpwRatesCard hospitalId={activeHospital?.id} />
          </div>
        </TabsContent>

          </div>{/* end tab content area */}
        </div>{/* end flex container */}
      </Tabs>

      {/* ── Galexis Configure Dialog ──────────────────────────────────── */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Galexis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                Save Configuration
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Catalog Column Mapping Dialog ─────────────────────────────── */}
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

      {/* ── Camera Create/Edit Dialog ─────────────────────────────────── */}
      <Dialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDevice
                ? t("admin.cameraDevices.editDevice", "Edit Camera Device")
                : t("admin.cameraDevices.addDevice", "Add Camera Device")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cameraId">{t("admin.cameraDevices.cameraId", "Camera ID")} *</Label>
              <Input
                id="cameraId"
                value={cameraForm.cameraId}
                onChange={(e) => setCameraForm({ ...cameraForm, cameraId: e.target.value })}
                placeholder="pi-cam-or1"
                disabled={!!editingDevice}
                data-testid="input-camera-id"
              />
              {!editingDevice && (
                <p className="text-xs text-muted-foreground">
                  {t("admin.cameraDevices.cameraIdHelp", "This must match the CAMERA_ID in your Pi's config.env file")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t("admin.cameraDevices.name", "Name")} *</Label>
              <Input
                id="name"
                value={cameraForm.name}
                onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })}
                placeholder="OR 1 Monitor Camera"
                data-testid="input-camera-name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCameraDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleCameraSubmit}
              disabled={createCameraMutation.isPending || updateCameraMutation.isPending}
              data-testid="button-save-camera"
            >
              {(createCameraMutation.isPending || updateCameraMutation.isPending) && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingDevice ? t("common.save", "Save") : t("common.create", "Create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Camera Delete AlertDialog ─────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.cameraDevices.deleteTitle", "Delete Camera Device")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.cameraDevices.deleteDescription", "Are you sure you want to delete this camera device? This action cannot be undone.")}
              {deletingDevice && (
                <span className="block mt-2 font-medium">{deletingDevice.name}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDevice && deleteCameraMutation.mutate(deletingDevice.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCameraMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
