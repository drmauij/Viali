import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Settings, Share2, FolderInput, CheckSquare, X, Receipt, ReceiptText, Copy, Check, Upload, Folder as FolderIcon, FolderPlus, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClinicService, Unit } from "@shared/schema";
import { ServiceGroupsMultiSelect } from "@/components/ServiceGroupsMultiSelect";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { FolderDialog, useFolderMutations } from "@/components/folders";
import type { Folder } from "@/components/folders";
import { buildServicesFolderAdapter } from "./servicesFolderAdapter";
import { DraggableItem, DroppableFolder } from "@/pages/items/DragDropComponents";

interface ServiceWithUnit extends ClinicService {
  unitName?: string;
  providerIds?: string[];
}

interface ServiceCardProps {
  service: ServiceWithUnit;
  isBulkMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (s: ServiceWithUnit) => void;
  onDelete: (s: ServiceWithUnit) => void;
  formatPrice: (price: string | null) => string;
  t: TFunction;
}

function ServiceCard({ service, isBulkMode, isSelected, onToggleSelect, onEdit, onDelete, formatPrice, t }: ServiceCardProps) {
  const groups: string[] = (service as any).serviceGroups ??
    ((service as any).serviceGroup ? [(service as any).serviceGroup] : []);
  return (
    <Card
      data-testid={`card-service-${service.id}`}
      className={isBulkMode && isSelected ? "ring-2 ring-primary" : ""}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          {isBulkMode && (
            <div className="mr-3 pt-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(service.id)}
                data-testid={`checkbox-service-${service.id}`}
              />
            </div>
          )}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={isBulkMode ? () => onToggleSelect(service.id) : undefined}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{service.name}</h3>
              {service.isShared && (
                <Badge variant="secondary" className="text-xs">
                  <Share2 className="h-3 w-3 mr-1" />
                  {t('clinic.services.shared')}
                </Badge>
              )}
            </div>
            {service.description && (
              <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
            )}
            {(service.code || groups.length > 0) && (
              <div className="flex gap-2 mt-1 text-xs text-muted-foreground items-center flex-wrap">
                {service.code && <span className="font-mono">#{service.code}</span>}
                {groups.map((g) => (
                  <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <p className="text-lg font-semibold text-primary">
                {formatPrice(service.price)}
              </p>
              {service.durationMinutes && (
                <Badge variant="outline" className="text-xs">
                  {service.durationMinutes} min
                </Badge>
              )}
            </div>
          </div>
          {!isBulkMode && (
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(service)}
                data-testid={`button-edit-service-${service.id}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(service)}
                data-testid={`button-delete-service-${service.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface BookableProvider {
  userId: string;
  user: { firstName: string; lastName: string };
}

export default function ClinicServices() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceWithUnit | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceWithUnit | null>(null);
  
  // Bulk import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");

  // Bulk move state
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkMoveTargetUnitId, setBulkMoveTargetUnitId] = useState<string>("");
  const [bulkProvidersDialogOpen, setBulkProvidersDialogOpen] = useState(false);
  const [bulkProviderIds, setBulkProviderIds] = useState<string[]>([]);
  const [bulkGroupDialogOpen, setBulkGroupDialogOpen] = useState(false);
  const [bulkGroupValue, setBulkGroupValue] = useState<string[]>([]);
  const [bulkFolderDialogOpen, setBulkFolderDialogOpen] = useState(false);
  const [bulkFolderTargetId, setBulkFolderTargetId] = useState<string | "none">("none");

  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);

  // Folder UI state (inline vertical pattern, like /inventory)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderDialogName, setFolderDialogName] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ overId: string; position: "above" | "below" } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    durationMinutes: "",
    isShared: false,
    isInvoiceable: false,
    code: "",
    serviceGroups: [] as string[],
    providerIds: [] as string[],
  });

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;
  const unitId = activeHospital?.unitId;

  const { data: services = [], isLoading } = useQuery<ServiceWithUnit[]>({
    queryKey: ['/api/clinic', hospitalId, 'services', unitId],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/services?unitId=${unitId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch services');
      return res.json();
    },
    enabled: !!hospitalId && !!unitId,
  });

  const folderAdapter = useMemo(
    () => (hospitalId && unitId ? buildServicesFolderAdapter(hospitalId, unitId) : null),
    [hospitalId, unitId],
  );
  const folderMut = useFolderMutations(folderAdapter ?? {
    foldersQueryKey: ["noop-folders"],
    itemsQueryKey: ["noop-items"],
    listFolders: async () => [],
    createFolder: async () => ({ id: "", name: "", sortOrder: 0 }),
    updateFolder: async () => ({ id: "", name: "", sortOrder: 0 }),
    deleteFolder: async () => {},
    bulkSortFolders: async () => {},
    moveItemToFolder: async () => {},
  });

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: folderAdapter?.foldersQueryKey ?? ["service-folders-disabled"],
    queryFn: () => folderAdapter!.listFolders(),
    enabled: !!folderAdapter,
  });

  // Fetch all units for bulk move
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['/api/admin', hospitalId, 'units'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/${hospitalId}/units`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch units');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // Fetch bookable providers for the provider picker
  const { data: bookableProviders = [] } = useQuery<BookableProvider[]>({
    queryKey: ['/api/clinic', hospitalId, 'bookable-providers'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/bookable-providers`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch providers');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // Fetch booking token for building the booking URL
  const { data: bookingTokenData } = useQuery<{ bookingToken: string | null }>({
    queryKey: [`/api/admin/${hospitalId}/booking-token`],
    enabled: !!hospitalId,
  });

  const { data: allGroupsData } = useQuery<{ groups: string[] }>({
    queryKey: ["/api/clinic", hospitalId, "service-groups"],
    enabled: !!hospitalId,
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/service-groups`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load groups");
      return res.json();
    },
  });
  const allGroups = allGroupsData?.groups ?? [];

  const [copiedBookingUrl, setCopiedBookingUrl] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; price: string | null; durationMinutes: number | null; isShared: boolean; isInvoiceable: boolean; code: string | null; serviceGroups: string[]; providerIds: string[] }) => {
      return apiRequest('POST', `/api/clinic/${hospitalId}/services`, { ...data, unitId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'service-groups'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: t('clinic.services.created') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string; price: string | null; durationMinutes: number | null; isShared: boolean; isInvoiceable: boolean; code: string | null; serviceGroups: string[]; providerIds: string[] }) => {
      return apiRequest('PATCH', `/api/clinic/${hospitalId}/services/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'service-groups'] });
      setDialogOpen(false);
      setEditingService(null);
      resetForm();
      toast({ title: t('clinic.services.updated') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      return apiRequest('DELETE', `/api/clinic/${hospitalId}/services/${serviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
      toast({ title: t('clinic.services.deleted') });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: async ({ serviceIds, targetUnitId }: { serviceIds: string[]; targetUnitId: string }) => {
      const response = await apiRequest('POST', `/api/clinic/${hospitalId}/services/bulk-move`, {
        serviceIds,
        targetUnitId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setIsBulkMode(false);
      setSelectedServices(new Set());
      setBulkMoveDialogOpen(false);
      setBulkMoveTargetUnitId("");
      toast({
        title: t('common.success'),
        description: t('clinic.services.bulkMoveSuccess', `${data.movedCount || 0} service(s) moved successfully`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('clinic.services.bulkMoveFailed', 'Failed to move services'),
        variant: "destructive",
      });
    },
  });

  const bulkSetBillableMutation = useMutation({
    mutationFn: async ({ serviceIds, isBillable }: { serviceIds: string[]; isBillable: boolean }) => {
      const response = await apiRequest('POST', `/api/clinic/${hospitalId}/services/bulk-set-billable`, {
        serviceIds,
        isBillable,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setIsBulkMode(false);
      setSelectedServices(new Set());
      toast({
        title: t('common.success'),
        description: data.isBillable 
          ? t('clinic.services.bulkSetBillableSuccess', `${data.updatedCount || 0} service(s) set as billable`)
          : t('clinic.services.bulkSetNotBillableSuccess', `${data.updatedCount || 0} service(s) set as not billable`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('clinic.services.bulkSetBillableFailed', 'Failed to update billable status'),
        variant: "destructive",
      });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (lines: { code: string; name: string; description: string }[]) => {
      const providerIds = bookableProviders.map(p => p.userId);
      const response = await apiRequest('POST', `/api/clinic/${hospitalId}/services/bulk-import`, {
        unitId,
        lines,
        providerIds,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setImportDialogOpen(false);
      setImportText("");
      const msg = `${data.created} service(s) imported`;
      const errMsg = data.errors?.length ? `\n${data.errors.join('\n')}` : '';
      toast({
        title: msg,
        description: errMsg || undefined,
        variant: data.errors?.length ? "default" : "default",
      });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const bulkUpdateGroupMutation = useMutation({
    mutationFn: async ({ serviceIds, serviceGroups }: { serviceIds: string[]; serviceGroups: string[] }) => {
      const response = await apiRequest('POST', `/api/clinic/${hospitalId}/services/bulk-update-group`, {
        serviceIds, serviceGroups,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'service-groups'] });
      setIsBulkMode(false);
      setSelectedServices(new Set());
      setBulkGroupDialogOpen(false);
      setBulkGroupValue([]);
      toast({
        title: t('common.success'),
        description: data.serviceGroups?.length
          ? `${data.updatedCount || 0} service(s) set to groups: ${data.serviceGroups.join(', ')}`
          : `${data.updatedCount || 0} service(s) cleared`,
      });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const bulkUpdateProvidersMutation = useMutation({
    mutationFn: async ({ serviceIds, providerIds, mode }: { serviceIds: string[]; providerIds: string[]; mode: 'set' | 'add' }) => {
      const response = await apiRequest('POST', `/api/clinic/${hospitalId}/services/bulk-update-providers`, {
        serviceIds, providerIds, mode,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      setIsBulkMode(false);
      setSelectedServices(new Set());
      setBulkProvidersDialogOpen(false);
      setBulkProviderIds([]);
      toast({
        title: t('common.success'),
        description: `${data.updatedCount || 0} service(s) updated (${data.mode})`,
      });
    },
    onError: () => {
      toast({ title: t('common.error'), variant: "destructive" });
    },
  });

  const bulkMoveToFolderMutation = useMutation({
    mutationFn: async () => {
      const folderId = bulkFolderTargetId === "none" ? null : bulkFolderTargetId;
      const selected = Array.from(selectedServices);
      const res = await apiRequest(
        "POST",
        `/api/clinic/${hospitalId}/services/bulk-move-to-folder`,
        { serviceIds: selected, folderId },
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/clinic', hospitalId, 'services', unitId] });
      if (folderAdapter) {
        queryClient.invalidateQueries({ queryKey: folderAdapter.foldersQueryKey });
      }
      setIsBulkMode(false);
      setSelectedServices(new Set());
      setBulkFolderDialogOpen(false);
      setBulkFolderTargetId("none");
      toast({
        title: t(
          "clinic.services.bulkMoveToFolderSuccess",
          `${data.movedCount || 0} service(s) moved`,
          { count: data.movedCount || 0 },
        ),
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t("clinic.services.bulkMoveToFolderFailed", "Failed to move services to folder"),
        description: error.message,
      });
    },
  });

  const handleBulkImport = () => {
    const rawLines = importText.trim().split('\n').filter(l => l.trim());
    if (rawLines.length === 0) {
      toast({ title: "No lines to import", variant: "destructive" });
      return;
    }

    const parsed = rawLines.map(line => {
      // Try tab-separated first, fall back to comma-separated
      let parts = line.split('\t');
      if (parts.length < 2) {
        parts = line.split(',');
      }
      return {
        code: parts[0]?.trim() || '',
        name: parts[1]?.trim() || parts[0]?.trim() || '',
        description: parts[2]?.trim() || '',
      };
    });

    bulkImportMutation.mutate(parsed);
  };

  const toggleServiceSelection = (serviceId: string) => {
    setSelectedServices(prev => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedServices.size === filteredServices.length) {
      setSelectedServices(new Set());
    } else {
      setSelectedServices(new Set(filteredServices.map(s => s.id)));
    }
  };

  const exitBulkMode = () => {
    setIsBulkMode(false);
    setSelectedServices(new Set());
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", price: "", durationMinutes: "", isShared: false, isInvoiceable: false, code: "", serviceGroups: [], providerIds: [] });
  };

  const handleOpenCreate = () => {
    setEditingService(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (service: ServiceWithUnit) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      price: service.price || "",
      durationMinutes: service.durationMinutes?.toString() || "",
      isShared: service.isShared || false,
      isInvoiceable: (service as any).isInvoiceable || false,
      code: service.code || "",
      serviceGroups: (service as any).serviceGroups ?? ((service as any).serviceGroup ? [(service as any).serviceGroup] : []),
      providerIds: service.providerIds || [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: t('clinic.services.requiredFields'), variant: "destructive" });
      return;
    }

    const durationMinutes = formData.durationMinutes ? parseInt(formData.durationMinutes, 10) : null;
    const price = formData.price ? formData.price : null;

    const code = formData.code.trim() || null;

    if (editingService) {
      updateMutation.mutate({
        id: editingService.id,
        name: formData.name,
        description: formData.description,
        price,
        durationMinutes,
        isShared: formData.isShared,
        isInvoiceable: formData.isInvoiceable,
        code,
        serviceGroups: formData.serviceGroups,
        providerIds: formData.providerIds,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        description: formData.description,
        price,
        durationMinutes,
        isShared: formData.isShared,
        isInvoiceable: formData.isInvoiceable,
        code,
        serviceGroups: formData.serviceGroups,
        providerIds: formData.providerIds,
      });
    }
  };

  const handleConfirmDelete = () => {
    if (serviceToDelete) {
      deleteMutation.mutate(serviceToDelete.id);
    }
  };

  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesSearch =
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (service.description?.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;
      if (activeGroupFilter === null) return true;
      const groups = (service as any).serviceGroups ?? ((service as any).serviceGroup ? [(service as any).serviceGroup] : []);
      return groups.includes(activeGroupFilter);
    });
  }, [services, searchTerm, activeGroupFilter]);

  const organizedServices = useMemo(() => {
    const rootServices = filteredServices.filter(s => !(s as any).folderId);
    const folderGroups = folders.map(folder => ({
      folder,
      items: filteredServices.filter(s => (s as any).folderId === folder.id),
    }));
    return { rootServices, folderGroups };
  }, [filteredServices, folders]);

  // Auto-expand folders that contain search/filter matches
  useEffect(() => {
    if (searchTerm || activeGroupFilter) {
      const withResults = organizedServices.folderGroups
        .filter(g => g.items.length > 0)
        .map(g => g.folder.id);
      setExpandedFolders(new Set(withResults));
    }
  }, [searchTerm, activeGroupFilter, organizedServices.folderGroups]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateFolder = () => {
    setEditingFolder(null);
    setFolderDialogName("");
    setFolderDialogOpen(true);
  };

  const handleEditFolder = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setFolderDialogName(folder.name);
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (window.confirm(t("folders.deleteFolderConfirm", "Delete this folder? Services will be moved to root."))) {
      folderMut.deleteFolder.mutate(folderId);
    }
  };

  const handleSaveFolder = () => {
    const name = folderDialogName.trim();
    if (!name) return;
    if (editingFolder) {
      folderMut.renameFolder.mutate(
        { id: editingFolder.id, name },
        { onSuccess: () => setFolderDialogOpen(false) },
      );
    } else {
      folderMut.createFolder.mutate(name, {
        onSuccess: () => setFolderDialogOpen(false),
      });
    }
  };

  const customCollisionDetection = (args: any) => {
    const { active, droppableContainers } = args;
    if (String(active.id).startsWith("folder-")) {
      return closestCorners(args);
    }
    const activeService = services.find((s) => s.id === active.id);
    const currentFolderId = (activeService as any)?.folderId as string | null | undefined;
    const filtered = droppableContainers.filter((c: any) => {
      const cid = String(c.id);
      if (currentFolderId && cid === `folder-${currentFolderId}`) return false;
      return true;
    });
    return closestCorners({ ...args, droppableContainers: filtered });
  };

  const handleDragStart = (event: any) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragOver = (event: any) => {
    const { active, over } = event;
    if (!over || !active) {
      setDropIndicator(null);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith("folder-") && overId.startsWith("folder-") && activeId !== overId) {
      const overRect = over.rect;
      const activeRect = active.rect.current.translated;
      if (overRect && activeRect) {
        const overMiddleY = overRect.top + overRect.height / 2;
        const activeMiddleY = activeRect.top + activeRect.height / 2;
        const position: "above" | "below" = activeMiddleY < overMiddleY ? "above" : "below";
        setDropIndicator({ overId, position });
      }
    } else {
      setDropIndicator(null);
    }
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setDropIndicator(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setDropIndicator(null);
    if (!over || !folderAdapter || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("folder-") && overId.startsWith("folder-")) {
      const fromId = activeId.replace("folder-", "");
      const toId = overId.replace("folder-", "");
      if (fromId === toId) return;
      const from = folders.findIndex((f) => f.id === fromId);
      const to = folders.findIndex((f) => f.id === toId);
      if (from === -1 || to === -1) return;
      const arr = [...folders];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      folderMut.bulkSortFolders.mutate(arr);
      return;
    }

    if (!activeId.startsWith("folder-")) {
      if (overId === "root") {
        folderMut.moveItem.mutate({ itemId: activeId, folderId: null });
        return;
      }
      if (overId.startsWith("folder-")) {
        const folderId = overId.replace("folder-", "");
        folderMut.moveItem.mutate({ itemId: activeId, folderId });
      }
    }
  };

  const formatPrice = (price: string | null) => {
    if (!price) return "-";
    return formatCurrency(price);
  };

  if (!hospitalId) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('common.noHospitalSelected')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="p-4 pb-24">
      <div className="space-y-4">
      {/* Title + primary actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('clinic.services.title', 'Services')}</h1>
        <div className="flex gap-2 flex-wrap">
        {!isBulkMode ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkMode(true)}
              data-testid="button-bulk-mode"
              className="flex-1 sm:flex-initial"
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {t('clinic.services.bulkActions', 'Bulk Actions')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} data-testid="button-import-services" className="flex-1 sm:flex-initial">
              <Upload className="h-4 w-4 mr-2" />
              {t('clinic.services.import', 'Import')}
            </Button>
            <Button size="sm" onClick={handleOpenCreate} data-testid="button-create-service" className="flex-1 sm:flex-initial">
              <Plus className="h-4 w-4 mr-2" />
              {t('clinic.services.create')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              data-testid="button-select-all"
              className="flex-1 sm:flex-initial"
            >
              {selectedServices.size === filteredServices.length && filteredServices.length > 0
                ? t('common.deselectAll', 'Deselect All')
                : t('common.selectAll', 'Select All')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setBulkMoveDialogOpen(true)}
              disabled={selectedServices.size === 0 || bulkMoveMutation.isPending}
              data-testid="button-bulk-move"
            >
              <FolderInput className="h-4 w-4 mr-2" />
              {t('clinic.services.moveToUnit', 'Move')} ({selectedServices.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkSetBillableMutation.mutate({ 
                serviceIds: Array.from(selectedServices), 
                isBillable: true 
              })}
              disabled={selectedServices.size === 0 || bulkSetBillableMutation.isPending}
              data-testid="button-bulk-set-billable"
            >
              <Receipt className="h-4 w-4 mr-2" />
              {t('clinic.services.setBillable', 'Set Billable')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkSetBillableMutation.mutate({ 
                serviceIds: Array.from(selectedServices), 
                isBillable: false 
              })}
              disabled={selectedServices.size === 0 || bulkSetBillableMutation.isPending}
              data-testid="button-bulk-set-not-billable"
            >
              <ReceiptText className="h-4 w-4 mr-2" />
              {t('clinic.services.setNotBillable', 'Set Not Billable')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkProviderIds([]);
                setBulkProvidersDialogOpen(true);
              }}
              disabled={selectedServices.size === 0}
              data-testid="button-bulk-update-providers"
            >
              Update Providers ({selectedServices.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkGroupValue([]);
                setBulkGroupDialogOpen(true);
              }}
              disabled={selectedServices.size === 0}
              data-testid="button-bulk-update-group"
            >
              Update Group ({selectedServices.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkFolderDialogOpen(true)}
              disabled={selectedServices.size === 0}
              data-testid="button-bulk-move-to-folder"
            >
              {t("clinic.services.bulkMoveToFolder", "Move to folder")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exitBulkMode}
              data-testid="button-exit-bulk"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('clinic.services.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-8"
          data-testid="input-search-services"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
            data-testid="input-search-services-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {allGroups.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Badge
            variant={activeGroupFilter === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveGroupFilter(null)}
          >
            {t("common.all", "All")}
          </Badge>
          {allGroups.map(g => (
            <Badge
              key={g}
              variant={activeGroupFilter === g ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap"
              onClick={() => setActiveGroupFilter(g)}
            >
              {g}
            </Badge>
          ))}
        </div>
      )}

      {/* Count + New folder */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t('clinic.services.servicesCount', `${filteredServices.length} services`, { count: filteredServices.length })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateFolder}
          data-testid="button-new-folder"
        >
          <FolderPlus className="w-4 h-4 mr-1" />
          {t('folders.newFolder', 'New folder')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredServices.length === 0 && organizedServices.folderGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {searchTerm ? t('clinic.services.noResults') : t('clinic.services.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Folders with nested services */}
          {organizedServices.folderGroups.map(({ folder, items: folderServices }) => (
            <div key={folder.id} className="space-y-2">
              <DraggableItem id={`folder-${folder.id}`} disabled={isBulkMode}>
                <DroppableFolder
                  id={`folder-${folder.id}`}
                  showDropIndicator={dropIndicator?.overId === `folder-${folder.id}` ? dropIndicator.position : null}
                >
                  <div
                    className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => toggleFolder(folder.id)}
                    data-testid={`folder-${folder.id}`}
                  >
                    {expandedFolders.has(folder.id) ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <FolderIcon className="w-5 h-5 text-primary shrink-0" />
                    <span className="flex-1 font-medium truncate">{folder.name}</span>
                    <span className="text-sm text-muted-foreground">({folderServices.length})</span>
                    <button
                      onClick={(e) => handleEditFolder(e, folder)}
                      className="p-1 hover:bg-muted rounded"
                      aria-label={t('folders.renameFolder', 'Rename folder')}
                      data-testid={`edit-folder-${folder.id}`}
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteFolder(e, folder.id)}
                      className="p-1 hover:bg-destructive/10 rounded"
                      aria-label={t('folders.deleteFolder', 'Delete folder')}
                      data-testid={`delete-folder-${folder.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </DroppableFolder>
              </DraggableItem>
              {expandedFolders.has(folder.id) && (
                <div className="pl-6 space-y-2">
                  {folderServices.map((service) => (
                    <DraggableItem key={service.id} id={service.id} disabled={isBulkMode}>
                      <ServiceCard
                        service={service}
                        isBulkMode={isBulkMode}
                        isSelected={selectedServices.has(service.id)}
                        onToggleSelect={toggleServiceSelection}
                        onEdit={handleOpenEdit}
                        onDelete={(s) => { setServiceToDelete(s); setDeleteDialogOpen(true); }}
                        formatPrice={formatPrice}
                        t={t}
                      />
                    </DraggableItem>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Root-level services (no folder) */}
          <DroppableFolder id="root">
            <div className="space-y-3">
              {organizedServices.rootServices.map((service) => (
                <DraggableItem key={service.id} id={service.id} disabled={isBulkMode}>
                  <ServiceCard
                    service={service}
                    isBulkMode={isBulkMode}
                    isSelected={selectedServices.has(service.id)}
                    onToggleSelect={toggleServiceSelection}
                    onEdit={handleOpenEdit}
                    onDelete={(s) => { setServiceToDelete(s); setDeleteDialogOpen(true); }}
                    formatPrice={formatPrice}
                    t={t}
                  />
                </DraggableItem>
              ))}
            </div>
          </DroppableFolder>
        </div>
      )}
      </div>

      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        mode={editingFolder ? "rename" : "create"}
        value={folderDialogName}
        onChange={setFolderDialogName}
        isSubmitting={folderMut.createFolder.isPending || folderMut.renameFolder.isPending}
        onSubmit={handleSaveFolder}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editingService ? t('clinic.services.edit') : t('clinic.services.create')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto min-h-0 flex-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t('clinic.services.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('clinic.services.namePlaceholder')}
                data-testid="input-service-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('clinic.services.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('clinic.services.descriptionPlaceholder')}
                rows={3}
                data-testid="input-service-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">{t('clinic.services.price')}</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-service-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">{t('clinic.services.duration', 'Duration (min)')}</Label>
                <Input
                  id="durationMinutes"
                  type="number"
                  min="1"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                  placeholder={t('clinic.services.durationPlaceholder', 'Optional')}
                  data-testid="input-service-duration"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">{t('clinic.services.bookingCode', 'Booking Code')}</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder={t('clinic.services.bookingCodePlaceholder', 'e.g. breast-augmentation')}
                maxLength={50}
                data-testid="input-service-code"
              />
              {formData.code && bookingTokenData?.bookingToken ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                  onClick={() => {
                    const url = `${window.location.origin}/book/${bookingTokenData.bookingToken}?service=${formData.code}`;
                    navigator.clipboard.writeText(url);
                    setCopiedBookingUrl(true);
                    setTimeout(() => setCopiedBookingUrl(false), 2000);
                  }}
                >
                  {copiedBookingUrl ? (
                    <Check className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <Copy className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
                  )}
                  <span>
                    .../book/...?service={formData.code}
                  </span>
                  <span className="text-muted-foreground/50">
                    {copiedBookingUrl ? '— copied!' : '— click to copy'}
                  </span>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('clinic.services.bookingCodeHint', 'Alphanumeric code used for direct booking links')}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Groups</Label>
              <ServiceGroupsMultiSelect
                hospitalId={hospitalId!}
                value={formData.serviceGroups}
                onChange={(v) => setFormData({ ...formData, serviceGroups: v })}
              />
              <p className="text-xs text-muted-foreground">
                Used to filter treatments on the booking page via <code>?service_group=</code> URL param.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isInvoiceable">{t('clinic.services.availableForInvoicing', 'Available for Invoicing')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('clinic.services.invoiceableDescription', 'Service will appear in invoice item picker')}
                </p>
              </div>
              <Switch
                id="isInvoiceable"
                checked={formData.isInvoiceable}
                onCheckedChange={(checked) => setFormData({ ...formData, isInvoiceable: checked })}
                data-testid="switch-service-invoiceable"
              />
            </div>
            {bookableProviders.length > 0 && (
              <div className="space-y-2">
                <Label>{t('clinic.services.bookableProviders', 'Bookable Providers')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('clinic.services.bookableProvidersHint', 'Select providers that offer this service for online booking')}
                </p>
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                  {bookableProviders.map((provider) => (
                    <label
                      key={provider.userId}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={formData.providerIds.includes(provider.userId)}
                        onCheckedChange={(checked) => {
                          setFormData(prev => ({
                            ...prev,
                            providerIds: checked
                              ? [...prev.providerIds, provider.userId]
                              : prev.providerIds.filter(id => id !== provider.userId),
                          }));
                        }}
                      />
                      <span className="text-sm">
                        {provider.user.firstName} {provider.user.lastName}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-service"
            >
              {editingService ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clinic.services.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('clinic.services.deleteConfirmDescription', { name: serviceToDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-service"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open);
        if (!open) setImportText("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clinic.services.importTitle', 'Import Services')}</DialogTitle>
            <DialogDescription>
              {t('clinic.services.importDesc', 'Paste a list of services — one per line. Each line: code, name, description (separated by tab or comma). All bookable providers will be assigned automatically.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"breast-aug\tBreast Augmentation\tCosmetic breast surgery\nrhino\tRhinoplasty\tNose reshaping procedure"}
              rows={10}
              className="font-mono text-sm"
              data-testid="textarea-import-services"
            />
            <p className="text-xs text-muted-foreground">
              {t('clinic.services.importHint', 'Format: code, name, description (tab or comma separated). Lines with only one value will use it as the name.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleBulkImport}
              disabled={!importText.trim() || bulkImportMutation.isPending}
              data-testid="button-confirm-import"
            >
              {bulkImportMutation.isPending ? t('common.importing', 'Importing...') : t('clinic.services.importButton', 'Import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={bulkMoveDialogOpen} onOpenChange={(open) => {
        setBulkMoveDialogOpen(open);
        if (!open) setBulkMoveTargetUnitId("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clinic.services.bulkMoveTitle', 'Move Services to Another Unit')}</DialogTitle>
            <DialogDescription>
              {t('clinic.services.bulkMoveDesc', `Move ${selectedServices.size} selected service(s) to a different unit.`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('clinic.services.targetUnit', 'Target Unit')}</Label>
              <Select value={bulkMoveTargetUnitId} onValueChange={setBulkMoveTargetUnitId}>
                <SelectTrigger data-testid="select-bulk-move-target">
                  <SelectValue placeholder={t('clinic.services.selectUnit', 'Select unit...')} />
                </SelectTrigger>
                <SelectContent>
                  {units
                    .filter(unit => unit.id !== unitId)
                    .map(unit => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMoveDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (bulkMoveTargetUnitId && selectedServices.size > 0) {
                  bulkMoveMutation.mutate({
                    serviceIds: Array.from(selectedServices),
                    targetUnitId: bulkMoveTargetUnitId
                  });
                }
              }}
              disabled={!bulkMoveTargetUnitId || bulkMoveMutation.isPending}
              data-testid="button-confirm-bulk-move"
            >
              {bulkMoveMutation.isPending ? t('common.moving', 'Moving...') : t('clinic.services.moveServices', 'Move Services')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Providers Dialog */}
      <Dialog open={bulkProvidersDialogOpen} onOpenChange={setBulkProvidersDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Providers for {selectedServices.size} Service(s)</DialogTitle>
            <DialogDescription>
              "Set" replaces the provider list entirely. "Add" appends to existing without removing any.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2 py-2">
            {bookableProviders.map(p => (
              <label key={p.userId} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={bulkProviderIds.includes(p.userId)}
                  onCheckedChange={(checked) => {
                    setBulkProviderIds(prev =>
                      checked ? [...prev, p.userId] : prev.filter(id => id !== p.userId)
                    );
                  }}
                />
                <span>{p.user.firstName} {p.user.lastName}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkProvidersDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => bulkUpdateProvidersMutation.mutate({
                serviceIds: Array.from(selectedServices),
                providerIds: bulkProviderIds,
                mode: 'add',
              })}
              disabled={bulkProviderIds.length === 0 || bulkUpdateProvidersMutation.isPending}
            >
              Add Providers
            </Button>
            <Button
              onClick={() => bulkUpdateProvidersMutation.mutate({
                serviceIds: Array.from(selectedServices),
                providerIds: bulkProviderIds,
                mode: 'set',
              })}
              disabled={bulkUpdateProvidersMutation.isPending}
            >
              Set Providers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Group Dialog */}
      <Dialog open={bulkGroupDialogOpen} onOpenChange={setBulkGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Groups for {selectedServices.size} Service(s)</DialogTitle>
            <DialogDescription>
              "Set Groups" assigns the selected groups to all. "Clear Groups" removes all groups.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ServiceGroupsMultiSelect
              hospitalId={hospitalId!}
              value={bulkGroupValue}
              onChange={setBulkGroupValue}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkUpdateGroupMutation.mutate({
                serviceIds: Array.from(selectedServices),
                serviceGroups: [],
              })}
              disabled={bulkUpdateGroupMutation.isPending}
            >
              Clear Groups
            </Button>
            <Button
              onClick={() => bulkUpdateGroupMutation.mutate({
                serviceIds: Array.from(selectedServices),
                serviceGroups: bulkGroupValue,
              })}
              disabled={bulkGroupValue.length === 0 || bulkUpdateGroupMutation.isPending}
            >
              Set Groups
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move to Folder Dialog */}
      <Dialog open={bulkFolderDialogOpen} onOpenChange={setBulkFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clinic.services.bulkMoveToFolder", "Move to folder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("folders.moveToFolder", "Move to folder")}</Label>
            <Select
              value={bulkFolderTargetId}
              onValueChange={(v) => setBulkFolderTargetId(v as string | "none")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("folders.moveToRoot", "Move to root")}</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkFolderDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              disabled={bulkMoveToFolderMutation.isPending}
              onClick={() => bulkMoveToFolderMutation.mutate()}
            >
              {t("common.move", "Move")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <DragOverlay>
      {activeDragId ? (
        <div className="bg-card border-2 border-primary rounded-lg p-3 shadow-lg opacity-90">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">
              {activeDragId.startsWith("folder-")
                ? t('folders.draggingFolder', 'Moving folder...')
                : t('clinic.services.draggingService', 'Moving service...')}
            </span>
          </div>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
