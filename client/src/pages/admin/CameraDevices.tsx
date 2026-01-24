import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Plus, Edit, Trash2, Wifi, WifiOff, Copy, Check, RefreshCw, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CameraDevice } from "@shared/schema";

function VisionAiProviderCard({ hospitalId, currentProvider }: { hospitalId?: string; currentProvider?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "pixtral">(
    (currentProvider as "openai" | "pixtral") || "openai"
  );

  useEffect(() => {
    setSelectedProvider((currentProvider as "openai" | "pixtral") || "openai");
  }, [currentProvider]);

  const updateProviderMutation = useMutation({
    mutationFn: async (provider: "openai" | "pixtral") => {
      const response = await apiRequest("PATCH", `/api/hospitals/${hospitalId}`, {
        visionAiProvider: provider,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({ 
        title: t("common.success"), 
        description: t("admin.visionAiProviderUpdated", "Vision AI provider updated successfully"),
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t("common.error"), 
        description: error.message || "Failed to update vision AI provider", 
        variant: "destructive" 
      });
    },
  });

  if (!hospitalId) return null;

  const handleProviderChange = (provider: "openai" | "pixtral") => {
    setSelectedProvider(provider);
    updateProviderMutation.mutate(provider);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
            <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-base">{t("admin.visionAi", "Vision AI Provider")}</CardTitle>
            <CardDescription>
              {t("admin.visionAiDescription", "AI model for analyzing camera images (vitals OCR, inventory)")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleProviderChange("openai")}
            disabled={updateProviderMutation.isPending}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedProvider === "openai"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            data-testid="button-select-openai"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <span className="font-medium text-sm">OpenAI GPT-4o</span>
              <span className="text-xs text-muted-foreground">gpt-4o-mini</span>
            </div>
          </button>

          <button
            onClick={() => handleProviderChange("pixtral")}
            disabled={updateProviderMutation.isPending}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedProvider === "pixtral"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
            data-testid="button-select-pixtral"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="font-medium text-sm">Mistral Pixtral</span>
              <span className="text-xs text-muted-foreground">pixtral-large-latest</span>
            </div>
          </button>
        </div>

        {updateProviderMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{t("common.saving", "Saving...")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CameraDevices() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<CameraDevice | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDevice, setDeletingDevice] = useState<CameraDevice | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    cameraId: "",
    name: "",
  });

  const isAdmin = activeHospital?.role === "admin";

  const { data: devices = [], isLoading, refetch } = useQuery<CameraDevice[]>({
    queryKey: ["/api/camera-devices", activeHospital?.id],
    queryFn: async () => {
      const res = await fetch(`/api/camera-devices?hospitalId=${activeHospital?.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeHospital?.id && isAdmin,
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
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
      setDialogOpen(false);
      resetForm();
      toast({
        title: t("admin.cameraDevices.created", "Camera device created"),
        description: t("admin.cameraDevices.createdDescription", "The camera device has been registered successfully."),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
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
      setDialogOpen(false);
      setEditingDevice(null);
      resetForm();
      toast({
        title: t("admin.cameraDevices.updated", "Camera device updated"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
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
      toast({
        title: t("admin.cameraDevices.deleted", "Camera device deleted"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setForm({ cameraId: "", name: "" });
  };

  const handleOpenCreate = () => {
    setEditingDevice(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (device: CameraDevice) => {
    setEditingDevice(device);
    setForm({
      cameraId: device.cameraId,
      name: device.name,
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (device: CameraDevice) => {
    setDeletingDevice(device);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingDevice) {
      updateMutation.mutate({
        id: editingDevice.id,
        data: { name: form.name },
      });
    } else {
      if (!form.cameraId.trim() || !form.name.trim()) {
        toast({
          title: t("common.error", "Error"),
          description: t("admin.cameraDevices.requiredFields", "Camera ID and Name are required"),
          variant: "destructive",
        });
        return;
      }
      createMutation.mutate({
        hospitalId: activeHospital?.id || "",
        cameraId: form.cameraId.trim(),
        name: form.name.trim(),
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

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("common.accessDenied", "Access denied")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Camera className="h-6 w-6" />
            {t("admin.cameraDevices.title", "Camera Devices")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("admin.cameraDevices.description", "Manage Raspberry Pi camera devices for automated vital signs capture")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} data-testid="button-refresh-cameras">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleOpenCreate} data-testid="button-add-camera">
            <Plus className="h-4 w-4 mr-2" />
            {t("admin.cameraDevices.addDevice", "Add Camera")}
          </Button>
        </div>
      </div>

      {isLoading ? (
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
            <Button onClick={handleOpenCreate}>
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
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(device)} data-testid={`button-edit-camera-${device.id}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(device)} data-testid={`button-delete-camera-${device.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDevice
                ? t("admin.cameraDevices.editDevice", "Edit Camera Device")
                : t("admin.cameraDevices.addDevice", "Add Camera Device")}
            </DialogTitle>
            <DialogDescription>
              {editingDevice
                ? t("admin.cameraDevices.editDescription", "Update the camera device details.")
                : t("admin.cameraDevices.addDescription", "Register a new Raspberry Pi camera device. The Camera ID must match the CAMERA_ID in your Pi's config.env file.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cameraId">{t("admin.cameraDevices.cameraId", "Camera ID")} *</Label>
              <Input
                id="cameraId"
                value={form.cameraId}
                onChange={(e) => setForm({ ...form, cameraId: e.target.value })}
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
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="OR 1 Monitor Camera"
                data-testid="input-camera-name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-camera"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingDevice ? t("common.save", "Save") : t("common.create", "Create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              onClick={() => deletingDevice && deleteMutation.mutate(deletingDevice.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
