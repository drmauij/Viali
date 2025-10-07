import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UpgradeDialog from "@/components/UpgradeDialog";
import type { Item, StockLevel, InsertItem, Vendor, Folder } from "@shared/schema";
import { DndContext, DragEndEvent, DragOverlay, closestCenter, pointerWithin, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderPlus, Edit2, Trash2, GripVertical } from "lucide-react";

type FilterType = "all" | "critical" | "controlled" | "expiring" | "belowMin";

interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
  soonestExpiry?: Date;
}

type UnitType = "pack" | "ampulle";

// Draggable item wrapper
function DraggableItem({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle - always visible for mobile/touch support */}
      {!disabled && (
        <div 
          {...listeners} 
          {...attributes}
          className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10 bg-muted/80 rounded p-1 touch-none"
          data-testid={`drag-handle-${id}`}
          title={t('items.dragToMove')}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className={!disabled ? "pl-8" : ""}>
        {children}
      </div>
    </div>
  );
}

// Droppable folder wrapper
function DroppableFolder({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div 
      ref={setNodeRef} 
      className={isOver ? "ring-2 ring-primary rounded-lg bg-primary/5 transition-all" : "transition-all"}
    >
      {children}
    </div>
  );
}

export default function Items() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState("name");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemWithStock | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("pack");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    minThreshold: "0",
    maxThreshold: "0",
    defaultOrderQty: "0",
    packSize: "1",
    controlledUnits: "0",
    actualStock: "0",
    critical: false,
    controlled: false,
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    minThreshold: "5",
    maxThreshold: "10",
    defaultOrderQty: "0",
    packSize: "1",
    controlledUnits: "0",
    initialStock: "0",
    critical: false,
    controlled: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const packSizeInputRef = useRef<HTMLInputElement>(null);
  const editPackSizeInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Bulk import state
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImages, setBulkImages] = useState<string[]>([]);
  const [bulkItems, setBulkItems] = useState<any[]>([]);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  
  // Bulk edit state
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [bulkEditItems, setBulkEditItems] = useState<Record<string, any>>({});
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Upgrade dialog state
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{
    currentCount: number;
    limit: number;
    licenseType: string;
  } | null>(null);

  // Folder state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: items = [], isLoading } = useQuery<ItemWithStock[]>({
    queryKey: ["/api/items", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ["/api/folders", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });
  
  // Show onboarding when there are no items
  useEffect(() => {
    if (!isLoading && items.length === 0 && activeHospital?.id) {
      const hasSeenOnboarding = localStorage.getItem(`onboarding-seen-${activeHospital.id}`);
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }
  }, [items.length, isLoading, activeHospital?.id]);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const { data: openOrderItems = {} } = useQuery<Record<string, { totalQty: number }>>({
    queryKey: ["/api/orders/open-items", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          hospitalId: activeHospital?.id,
          locationId: activeHospital?.locationId,
        }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === "LICENSE_LIMIT_REACHED") {
          setLicenseInfo({
            currentCount: errorData.currentCount,
            limit: errorData.limit,
            licenseType: errorData.licenseType,
          });
          setUpgradeDialogOpen(true);
          return null;
        }
        throw new Error(errorData.message || t('items.failedToCreate'));
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      resetForm();
      setAddDialogOpen(false);
      toast({
        title: t('common.success'),
        description: t('items.itemCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToCreate'),
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (data: any) => {
      // Update item details
      const response = await apiRequest("PATCH", `/api/items/${selectedItem?.id}`, data.itemData);
      const updatedItem = await response.json();
      
      // Update stock level if provided
      if (data.actualStock !== undefined && selectedItem) {
        const currentStock = selectedItem.stockLevel?.qtyOnHand || 0;
        const newStock = parseInt(data.actualStock);
        const delta = newStock - currentStock;
        
        await apiRequest("POST", "/api/stock/update", {
          itemId: selectedItem.id,
          qty: newStock,
          delta: delta,
          notes: "Stock updated via item edit",
        });
      }
      
      return updatedItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      setEditDialogOpen(false);
      toast({
        title: t('common.success'),
        description: t('items.itemUpdatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToUpdate'),
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("DELETE", `/api/items/${itemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      setEditDialogOpen(false);
      toast({
        title: t('items.deleteItem'),
        description: t('items.itemDeletedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToDelete'),
        variant: "destructive",
      });
    },
  });

  const normalizeUnit = (unit: string): UnitType => {
    const normalized = unit.toLowerCase();
    if (normalized === "pack" || normalized === "box") {
      return "pack";
    }
    return "ampulle";
  };

  // Auto-focus pack size field in Add Item dialog when it becomes visible
  useEffect(() => {
    if (selectedUnit === "pack" && formData.controlled && addDialogOpen) {
      setTimeout(() => {
        packSizeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedUnit, formData.controlled, addDialogOpen]);

  // Auto-focus pack size field in Edit Item dialog when it becomes visible
  useEffect(() => {
    if (selectedUnit === "pack" && editFormData.controlled && editDialogOpen) {
      setTimeout(() => {
        editPackSizeInputRef.current?.focus();
      }, 100);
    }
  }, [selectedUnit, editFormData.controlled, editDialogOpen]);

  const handleEditItem = (item: ItemWithStock) => {
    setSelectedItem(item);
    setEditFormData({
      name: item.name,
      description: item.description || "",
      barcode: item.barcodes?.[0] || "",
      minThreshold: String(item.minThreshold || 0),
      maxThreshold: String(item.maxThreshold || 0),
      defaultOrderQty: String(item.defaultOrderQty || 0),
      packSize: String(item.packSize || 1),
      controlledUnits: String(item.controlledUnits || 0),
      actualStock: String(item.stockLevel?.qtyOnHand || 0),
      critical: item.critical || false,
      controlled: item.controlled || false,
    });
    setSelectedUnit(normalizeUnit(item.unit));
    setEditDialogOpen(true);
  };

  const quickOrderMutation = useMutation({
    mutationFn: async (data: { itemId: string; qty: number; packSize: number; vendorId?: string }) => {
      const response = await apiRequest("POST", "/api/orders/quick-add", {
        hospitalId: activeHospital?.id,
        itemId: data.itemId,
        qty: data.qty,
        packSize: data.packSize,
        vendorId: data.vendorId || null,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open-items", activeHospital?.id] });
      toast({
        title: t('items.addedToOrder'),
        description: t('items.addedToDraftOrder'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToCreate'),
        variant: "destructive",
      });
    },
  });

  const bulkAnalyzeMutation = useMutation({
    mutationFn: async (images: string[]) => {
      const response = await apiRequest("POST", "/api/items/analyze-images", { images });
      return await response.json();
    },
    onSuccess: (data) => {
      setBulkItems(data.items || []);
      toast({
        title: t('items.analysisComplete'),
        description: t('items.extractedItems', { count: data.items?.length || 0 }),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('items.analysisFailed'),
        description: error.message || t('items.failedToAnalyze'),
        variant: "destructive",
      });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await fetch("/api/items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          hospitalId: activeHospital?.id,
        }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === "LICENSE_LIMIT_REACHED") {
          setLicenseInfo({
            currentCount: errorData.currentCount,
            limit: errorData.limit,
            licenseType: errorData.licenseType,
          });
          setUpgradeDialogOpen(true);
          return null;
        }
        throw new Error(errorData.message || t('items.failedToImport'));
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      setBulkImportOpen(false);
      setBulkImages([]);
      setBulkItems([]);
      toast({
        title: t('common.success'),
        description: t('items.itemsImportedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToImport'),
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await apiRequest("PATCH", "/api/items/bulk-update", { items });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      setIsBulkEditMode(false);
      setBulkEditItems({});
      toast({
        title: t('common.success'),
        description: t('items.itemsUpdatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToBulkUpdate'),
        variant: "destructive",
      });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/folders", {
        name,
        hospitalId: activeHospital?.id,
        locationId: activeHospital?.locationId,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders", activeHospital?.id] });
      setFolderDialogOpen(false);
      setFolderName("");
      toast({
        title: t('common.success'),
        description: t('items.folderCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToCreateFolder'),
        variant: "destructive",
      });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/folders/${id}`, { name });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders", activeHospital?.id] });
      setFolderDialogOpen(false);
      setEditingFolder(null);
      setFolderName("");
      toast({
        title: t('common.success'),
        description: t('items.folderUpdatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToUpdateFolder'),
        variant: "destructive",
      });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/folders/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders", activeHospital?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
      toast({
        title: t('common.success'),
        description: t('items.folderDeletedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToDeleteFolder'),
        variant: "destructive",
      });
    },
  });

  const moveItemMutation = useMutation({
    mutationFn: async ({ itemId, folderId }: { itemId: string; folderId: string | null }) => {
      const response = await apiRequest("PATCH", `/api/items/${itemId}`, { folderId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", activeHospital?.id] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToMove'),
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: any) => {
    setActiveItemId(event.active.id as string);
  };

  const handleDragCancel = () => {
    setActiveItemId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItemId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const itemId = active.id as string;
    const overId = over.id as string;

    if (overId === "root") {
      moveItemMutation.mutate({ itemId, folderId: null });
    } else if (overId.startsWith("folder-")) {
      const folderId = overId.replace("folder-", "");
      moveItemMutation.mutate({ itemId, folderId });
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleCreateFolder = () => {
    setEditingFolder(null);
    setFolderName("");
    setFolderDialogOpen(true);
  };

  const handleEditFolder = (e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (confirm(t('items.deleteFolderConfirm'))) {
      deleteFolderMutation.mutate(folderId);
    }
  };

  const handleSaveFolder = () => {
    if (!folderName.trim()) {
      toast({
        title: t('common.error'),
        description: t('items.folderNameRequired'),
        variant: "destructive",
      });
      return;
    }

    if (editingFolder) {
      updateFolderMutation.mutate({ id: editingFolder.id, name: folderName });
    } else {
      createFolderMutation.mutate(folderName);
    }
  };

  const handleQuickOrder = (e: React.MouseEvent, item: ItemWithStock) => {
    e.stopPropagation();
    
    const currentStock = item.stockLevel?.qtyOnHand || 0;
    const maxThreshold = item.maxThreshold || 10;
    const qtyToOrder = Math.max(0, maxThreshold - currentStock);

    if (qtyToOrder <= 0) {
      toast({
        title: t('items.stockSufficient'),
        description: t('items.stockAboveMax'),
      });
      return;
    }

    const packSize = item.packSize || 1;

    // Use item's vendor if available, or first available vendor, or null
    const defaultVendor = item.vendorId ? vendors.find(v => v.id === item.vendorId) : vendors[0];

    quickOrderMutation.mutate({
      itemId: item.id,
      qty: qtyToOrder,
      packSize,
      vendorId: defaultVendor?.id,
    });
  };

  const handleUpdateItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const itemData = {
      name: editFormData.name,
      description: editFormData.description,
      unit: selectedUnit,
      barcodes: editFormData.barcode ? [editFormData.barcode] : undefined,
      minThreshold: parseInt(editFormData.minThreshold) || 0,
      maxThreshold: parseInt(editFormData.maxThreshold) || 0,
      defaultOrderQty: parseInt(editFormData.defaultOrderQty) || 0,
      packSize: (selectedUnit === "pack" && editFormData.controlled) ? parseInt(editFormData.packSize) || 1 : 1,
      controlledUnits: (selectedUnit === "pack" && editFormData.controlled) ? parseInt(editFormData.controlledUnits) || 0 : 0,
      critical: editFormData.critical,
      controlled: editFormData.controlled,
    };

    updateItemMutation.mutate({
      itemData,
      actualStock: editFormData.actualStock,
    });
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Resize if image is too large (max 800px on longest side for better compression)
          const maxSize = 800;
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
          
          // Compress to JPEG with 0.7 quality for better size reduction
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedBase64);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    const allResults: any[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Compress image before sending
        const compressedImage = await compressImage(file);
        setUploadedImages(prev => [...prev, compressedImage]);
        
        // Analyze image with AI
        try {
          const response = await apiRequest('POST', '/api/items/analyze-image', {
            image: compressedImage
          });
          const result: any = await response.json();
          allResults.push(result);
          
          // Update form with the first valid result
          if (i === 0 || !formData.name) {
            // Build name by appending concentration and size if available
            let itemName = result.name || '';
            if (result.concentration) {
              itemName += ` ${result.concentration}`;
            }
            if (result.size) {
              itemName += ` ${result.size}`;
            }
            
            setFormData(prev => ({
              ...prev,
              name: itemName.trim() || prev.name,
              description: result.description || prev.description,
              barcode: result.barcode || prev.barcode,
            }));
            
            if (result.unit) {
              setSelectedUnit(result.unit as UnitType);
            }
          }
        } catch (error: any) {
          console.error(`Failed to analyze image ${i + 1}:`, error);
        }
      }
      
      if (allResults.length > 0) {
        const avgConfidence = allResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / allResults.length;
        toast({
          title: "Images analyzed",
          description: `Processed ${allResults.length} image(s) with ${Math.round(avgConfidence * 100)}% avg confidence`,
        });
      } else {
        toast({
          title: "Analysis failed",
          description: "Could not extract data from images",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process images",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const itemData = {
      name: formData.name,
      description: formData.description,
      unit: selectedUnit,
      barcodes: formData.barcode ? [formData.barcode] : undefined,
      minThreshold: parseInt(formData.minThreshold) || 0,
      maxThreshold: parseInt(formData.maxThreshold) || 0,
      defaultOrderQty: parseInt(formData.defaultOrderQty) || 0,
      packSize: (selectedUnit === "pack" && formData.controlled) ? parseInt(formData.packSize) || 1 : 1,
      controlledUnits: (selectedUnit === "pack" && formData.controlled) ? parseInt(formData.controlledUnits) || 0 : 0,
      critical: formData.critical,
      controlled: formData.controlled,
      initialStock: parseInt(formData.initialStock) || 0,
    };

    createItemMutation.mutate(itemData);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      barcode: "",
      minThreshold: "5",
      maxThreshold: "10",
      defaultOrderQty: "0",
      packSize: "1",
      controlledUnits: "0",
      initialStock: "0",
      critical: false,
      controlled: false,
    });
    setSelectedUnit("pack");
    setUploadedImages([]);
  };

  const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (files.length > 10) {
      toast({
        title: "Too Many Images",
        description: "Maximum 10 images allowed",
        variant: "destructive",
      });
      return;
    }

    setIsBulkAnalyzing(true);
    const images: string[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const compressedImage = await compressImage(files[i]);
        images.push(compressedImage);
      }
      setBulkImages(images);
      await bulkAnalyzeMutation.mutateAsync(images);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to process images",
        variant: "destructive",
      });
    } finally {
      setIsBulkAnalyzing(false);
      e.target.value = '';
    }
  };

  const handleBulkImportSave = () => {
    if (bulkItems.length === 0) {
      toast({
        title: "No Items",
        description: "No items to import",
        variant: "destructive",
      });
      return;
    }
    bulkCreateMutation.mutate(bulkItems);
  };

  const handleBulkEditSave = () => {
    const updates = Object.entries(bulkEditItems).map(([id, data]) => ({ id, ...data }));
    if (updates.length === 0) {
      setIsBulkEditMode(false);
      return;
    }
    bulkUpdateMutation.mutate(updates);
  };

  const filterAndSortItems = (itemsToFilter: ItemWithStock[]) => {
    let filtered = itemsToFilter;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (activeFilter !== "all") {
      filtered = filtered.filter(item => {
        switch (activeFilter) {
          case "critical":
            return item.critical;
          case "controlled":
            return item.controlled;
          case "expiring":
            if (!item.soonestExpiry) return false;
            const daysUntilExpiry = Math.ceil((new Date(item.soonestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
          case "belowMin":
            return (item.stockLevel?.qtyOnHand || 0) <= (item.minThreshold || 0);
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "expiry":
          const aExpiry = a.soonestExpiry ? new Date(a.soonestExpiry).getTime() : Infinity;
          const bExpiry = b.soonestExpiry ? new Date(b.soonestExpiry).getTime() : Infinity;
          return aExpiry - bExpiry;
        case "usage":
          return Math.random() - 0.5;
        case "stock":
          const aStock = a.stockLevel?.qtyOnHand || 0;
          const bStock = b.stockLevel?.qtyOnHand || 0;
          return aStock - bStock;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  };

  const organizedItems = useMemo(() => {
    const rootItems = items.filter(item => !item.folderId);
    const folderGroups = folders.map(folder => ({
      folder,
      items: items.filter(item => item.folderId === folder.id),
    }));

    return {
      rootItems: filterAndSortItems(rootItems),
      folderGroups: folderGroups.map(group => ({
        folder: group.folder,
        items: filterAndSortItems(group.items),
      })).filter(group => group.items.length > 0 || searchTerm === ""),
    };
  }, [items, folders, searchTerm, activeFilter, sortBy]);

  const filteredItems = useMemo(() => {
    return [...organizedItems.rootItems, ...organizedItems.folderGroups.flatMap(g => g.items)];
  }, [organizedItems]);

  const getFilterCounts = () => {
    return {
      all: items.length,
      critical: items.filter(item => item.critical).length,
      controlled: items.filter(item => item.controlled).length,
      expiring: items.filter(item => {
        if (!item.soonestExpiry) return false;
        const daysUntilExpiry = Math.ceil((new Date(item.soonestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
      }).length,
      belowMin: items.filter(item => (item.stockLevel?.qtyOnHand || 0) <= (item.minThreshold || 0)).length,
    };
  };

  const filterCounts = getFilterCounts();

  const getDaysUntilExpiry = (expiryDate?: Date) => {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryColor = (days: number | null) => {
    if (!days || days < 0) return "expiry-red";
    if (days <= 30) return "expiry-red";
    if (days <= 60) return "expiry-orange";
    if (days <= 90) return "expiry-yellow";
    return "expiry-green";
  };

  const getStockStatus = (item: ItemWithStock) => {
    const currentQty = item.stockLevel?.qtyOnHand || 0;
    const minThreshold = item.minThreshold || 0;
    
    if (currentQty <= minThreshold) {
      return { color: "text-warning", status: t('items.belowMin') };
    }
    return { color: "text-success", status: t('items.good') };
  };
  
  const handleDismissOnboarding = () => {
    if (activeHospital?.id) {
      localStorage.setItem(`onboarding-seen-${activeHospital.id}`, 'true');
    }
    setShowOnboarding(false);
  };
  
  const handleStartBulkImport = () => {
    handleDismissOnboarding();
    setBulkImportOpen(true);
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('items.noHospitalSelected')}</h3>
          <p className="text-muted-foreground">{t('items.selectHospitalToView')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-foreground">{t('items.title')}</h1>
          <div className="flex gap-2">
            {isBulkEditMode ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setIsBulkEditMode(false); setBulkEditItems({}); }} data-testid="cancel-bulk-edit" className="flex-1 sm:flex-initial">
                  {t('common.cancel')}
                </Button>
                <Button size="sm" onClick={handleBulkEditSave} disabled={bulkUpdateMutation.isPending} data-testid="save-bulk-edit" className="flex-1 sm:flex-initial">
                  <i className="fas fa-save mr-2"></i>
                  {t('items.saveAll')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => { setIsBulkEditMode(true); setBulkEditItems({}); }} data-testid="bulk-edit-button" className="flex-1 sm:flex-initial">
                  <i className="fas fa-edit mr-2"></i>
                  {t('items.bulkEdit')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} data-testid="bulk-import-button" className="flex-1 sm:flex-initial">
                  <i className="fas fa-upload mr-2"></i>
                  {t('items.bulkImport')}
                </Button>
                <Button size="sm" onClick={() => setAddDialogOpen(true)} data-testid="add-item-button" className="flex-1 sm:flex-initial">
                  <i className="fas fa-plus mr-2"></i>
                  {t('items.addItem')}
                </Button>
              </>
            )}
          </div>
        </div>

      {/* Search */}
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"></i>
        <Input
          placeholder={t('items.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="items-search"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "all" ? "chip-primary" : "chip-muted"}`}
          onClick={() => setActiveFilter("all")}
          data-testid="filter-all"
        >
          {t('items.allItems', { count: filterCounts.all })}
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "belowMin" ? "chip-warning" : "chip-muted"}`}
          onClick={() => setActiveFilter("belowMin")}
          data-testid="filter-below-min"
        >
          <i className="fas fa-arrow-down text-xs mr-1"></i>
          {t('items.belowMinItems', { count: filterCounts.belowMin })}
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "critical" ? "chip-critical" : "chip-muted"}`}
          onClick={() => setActiveFilter("critical")}
          data-testid="filter-critical"
        >
          <i className="fas fa-exclamation-circle text-xs mr-1"></i>
          {t('items.criticalItems', { count: filterCounts.critical })}
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "controlled" ? "chip-controlled" : "chip-muted"}`}
          onClick={() => setActiveFilter("controlled")}
          data-testid="filter-controlled"
        >
          <i className="fas fa-shield-halved text-xs mr-1"></i>
          {t('items.controlledItems', { count: filterCounts.controlled })}
        </button>
      </div>

      {/* Sort Options and Create Folder */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t('items.itemsCount', { count: filteredItems.length })}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateFolder}
            data-testid="create-folder-button"
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            {t('items.newFolder')}
          </Button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="items-sort"
          >
            <option value="name">{t('items.sortNameAZ')}</option>
            <option value="stock">{t('items.sortStockLevel')}</option>
          </select>
        </div>
      </div>

      {/* Items List with Folders */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
              <p className="text-muted-foreground">{t('items.loadingItems')}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <i className="fas fa-search text-4xl text-muted-foreground mb-4"></i>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('items.noItemsFound')}</h3>
              <p className="text-muted-foreground">
                {searchTerm ? t('items.tryAdjustingSearch') : t('items.noItemsMatchFilters')}
              </p>
            </div>
          ) : (
            <>
              {/* Render folders */}
              {organizedItems.folderGroups.map(({ folder, items: folderItems }) => (
                <div key={folder.id} className="space-y-2">
                  <DroppableFolder id={`folder-${folder.id}`}>
                    <div
                      className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors"
                      onClick={() => toggleFolder(folder.id)}
                      data-testid={`folder-${folder.id}`}
                    >
                      {expandedFolders.has(folder.id) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <FolderIcon className="w-5 h-5 text-primary" />
                      <span className="flex-1 font-medium text-foreground">{folder.name}</span>
                      <span className="text-sm text-muted-foreground">({folderItems.length})</span>
                      <button
                        onClick={(e) => handleEditFolder(e, folder)}
                        className="p-1 hover:bg-muted rounded"
                        data-testid={`edit-folder-${folder.id}`}
                      >
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteFolder(e, folder.id)}
                        className="p-1 hover:bg-destructive/10 rounded"
                        data-testid={`delete-folder-${folder.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </DroppableFolder>
                  {expandedFolders.has(folder.id) && (
                    <div className="pl-6 space-y-2">
                      {folderItems.map((item) => {
                        const stockStatus = getStockStatus(item);
                        const daysUntilExpiry = getDaysUntilExpiry(item.soonestExpiry);
                        const currentQty = item.stockLevel?.qtyOnHand || 0;

                        return (
                          <DraggableItem key={item.id} id={item.id} disabled={isBulkEditMode}>
                            <div
                              className="item-row"
                              data-testid={`item-${item.id}`}
                            >
                              <div className="flex items-start justify-between mb-3">
                                {isBulkEditMode ? (
                                  <div className="flex-1 space-y-2">
                                    <div>
                                      <Label className="text-xs">{t('items.name')}</Label>
                                      <Input
                                        value={bulkEditItems[item.id]?.name !== undefined ? bulkEditItems[item.id].name : item.name}
                                        onChange={(e) => {
                                          setBulkEditItems(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], name: e.target.value }
                                          }));
                                        }}
                                        data-testid={`bulk-edit-name-${item.id}`}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1 min-w-0 pr-3">
                                      <div className="flex items-start gap-2">
                                        <h3 className="text-sm font-semibold text-foreground truncate flex-1">{item.name}</h3>
                                        <div className="flex gap-1 flex-shrink-0">
                                          {item.critical && (
                                            <span className="status-chip chip-critical text-xs" data-testid={`item-${item.id}-critical`}>
                                              <i className="fas fa-exclamation-circle"></i>
                                            </span>
                                          )}
                                          {item.controlled && (
                                            <span className="status-chip chip-controlled text-xs" data-testid={`item-${item.id}-controlled`}>
                                              <i className="fas fa-shield-halved"></i>
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {item.description && (
                                        <p className="text-xs text-muted-foreground mt-1 truncate">{item.description}</p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      className="p-2 hover:bg-muted rounded-md transition-colors flex-shrink-0"
                                      data-testid={`edit-item-${item.id}`}
                                    >
                                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                  </>
                                )}
                              </div>

                              {daysUntilExpiry !== null && (
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`expiry-indicator ${getExpiryColor(daysUntilExpiry)}`}></div>
                                  <span className="text-sm text-muted-foreground">
                                    {t('items.expiresInDays', { days: Math.max(0, daysUntilExpiry) })}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                {isBulkEditMode ? (
                                  <div className="flex gap-2 flex-1">
                                    <div className="flex-1">
                                      <Label className="text-xs">{t('items.stock')}</Label>
                                      <Input
                                        type="number"
                                        value={bulkEditItems[item.id]?.actualStock !== undefined ? bulkEditItems[item.id].actualStock : currentQty}
                                        onChange={(e) => {
                                          setBulkEditItems(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], actualStock: parseInt(e.target.value) || 0 }
                                          }));
                                        }}
                                        data-testid={`bulk-edit-stock-${item.id}`}
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <Label className="text-xs">{t('items.minThreshold')}</Label>
                                      <Input
                                        type="number"
                                        value={bulkEditItems[item.id]?.minThreshold !== undefined ? bulkEditItems[item.id].minThreshold : (item.minThreshold || 0)}
                                        onChange={(e) => {
                                          setBulkEditItems(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], minThreshold: parseInt(e.target.value) || 0 }
                                          }));
                                        }}
                                        data-testid={`bulk-edit-min-${item.id}`}
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <Label className="text-xs">{t('items.maxThreshold')}</Label>
                                      <Input
                                        type="number"
                                        value={bulkEditItems[item.id]?.maxThreshold !== undefined ? bulkEditItems[item.id].maxThreshold : (item.maxThreshold || 0)}
                                        onChange={(e) => {
                                          setBulkEditItems(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], maxThreshold: parseInt(e.target.value) || 0 }
                                          }));
                                        }}
                                        data-testid={`bulk-edit-max-${item.id}`}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-3 flex-wrap text-xs">
                                      <span className="text-muted-foreground">{item.unit}</span>
                                      {item.stockLevel && (
                                        <div className={`inline-flex items-center gap-1 ${stockStatus.color}`}>
                                          <i className={`fas ${currentQty > 0 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                                          <span className="font-semibold" data-testid={`item-${item.id}-stock`}>{currentQty}</span>
                                          {item.minThreshold !== null && item.minThreshold !== undefined && (
                                            <span className="text-muted-foreground">
                                              / Min: {item.minThreshold} / Max: {item.maxThreshold || 0}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {currentQty <= (item.minThreshold || 0) && (
                                      <button
                                        onClick={(e) => handleQuickOrder(e, item)}
                                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
                                        data-testid={`item-${item.id}-quick-order`}
                                      >
                                        <i className="fas fa-bolt mr-1"></i>
                                        {t('items.quickOrder')}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </DraggableItem>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Render root items */}
              <DroppableFolder id="root">
                <div className="space-y-3">
                  {organizedItems.rootItems.map((item) => {
                    const stockStatus = getStockStatus(item);
                    const daysUntilExpiry = getDaysUntilExpiry(item.soonestExpiry);
                    const currentQty = item.stockLevel?.qtyOnHand || 0;

                    return (
                      <DraggableItem key={item.id} id={item.id} disabled={isBulkEditMode}>
                        <div 
                          className="item-row"
                          data-testid={`item-${item.id}`}
                        >
                <div className="flex items-start justify-between mb-3">
                  {isBulkEditMode ? (
                    <div className="flex-1 space-y-2">
                      <div>
                        <Label className="text-xs">{t('items.name')}</Label>
                        <Input
                          value={bulkEditItems[item.id]?.name !== undefined ? bulkEditItems[item.id].name : item.name}
                          onChange={(e) => {
                            setBulkEditItems(prev => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], name: e.target.value }
                            }));
                          }}
                          data-testid={`bulk-edit-name-${item.id}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0 pr-3">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        <p className="text-sm text-muted-foreground">{item.description || `${item.unit} unit`}</p>
                      </div>
                      <div className="flex gap-1 items-center">
                        {item.critical && (
                          <span className="status-chip chip-critical text-xs">
                            <i className="fas fa-exclamation-circle"></i>
                          </span>
                        )}
                        {item.controlled && (
                          <span className="status-chip chip-controlled text-xs">
                            <i className="fas fa-shield-halved"></i>
                          </span>
                        )}
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-2 hover:bg-muted rounded-md transition-colors"
                          data-testid={`edit-item-${item.id}`}
                        >
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {daysUntilExpiry !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`expiry-indicator ${getExpiryColor(daysUntilExpiry)}`}></div>
                    <span className="text-sm text-muted-foreground">
                      {t('items.expiresInDays', { days: Math.max(0, daysUntilExpiry) })}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {isBulkEditMode ? (
                    <div className="flex gap-2 flex-1">
                      <div className="flex-1">
                        <Label className="text-xs">{t('items.stock')}</Label>
                        <Input
                          type="number"
                          value={bulkEditItems[item.id]?.actualStock !== undefined ? bulkEditItems[item.id].actualStock : currentQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setBulkEditItems(prev => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], actualStock: val }
                            }));
                          }}
                          data-testid={`bulk-edit-stock-${item.id}`}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">{t('items.min')}</Label>
                        <Input
                          type="number"
                          value={bulkEditItems[item.id]?.minThreshold !== undefined ? bulkEditItems[item.id].minThreshold : (item.minThreshold || 0)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setBulkEditItems(prev => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], minThreshold: val }
                            }));
                          }}
                          data-testid={`bulk-edit-min-${item.id}`}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">{t('items.max')}</Label>
                        <Input
                          type="number"
                          value={bulkEditItems[item.id]?.maxThreshold !== undefined ? bulkEditItems[item.id].maxThreshold : (item.maxThreshold || 0)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setBulkEditItems(prev => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], maxThreshold: val }
                            }));
                          }}
                          data-testid={`bulk-edit-max-${item.id}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-2xl font-bold ${stockStatus.color}`}>
                            {currentQty}
                          </span>
                          <i className={`fas ${normalizeUnit(item.unit) === "pack" ? "fa-box" : "fa-vial"} text-lg ${stockStatus.color}`}></i>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          / Min: {item.minThreshold || 0} / Max: {item.maxThreshold || 0}
                        </span>
                      </div>
                      {openOrderItems[item.id] ? (
                        <Button variant="outline" size="sm" disabled data-testid={`quick-ordered-${item.id}`}>
                          <i className="fas fa-check mr-1"></i>
                          {t('items.quickOrdered', { count: openOrderItems[item.id].totalQty })}
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={(e) => handleQuickOrder(e, item)} data-testid={`quick-order-${item.id}`}>
                          <i className="fas fa-bolt mr-1"></i>
                          {t('items.quickOrder')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                        </div>
                      </DraggableItem>
                    );
                  })}
                </div>
              </DroppableFolder>
            </>
          )}
        </div>
        <DragOverlay>
          {activeItemId ? (
            <div className="bg-card border-2 border-primary rounded-lg p-3 shadow-lg opacity-90">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{t('items.draggingItem')}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingFolder ? t('items.editFolder') : t('items.createFolder')}</DialogTitle>
            <DialogDescription>
              {editingFolder ? t('items.updateFolderName') : t('items.createNewFolder')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="folder-name">{t('items.folderName')}</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={t('items.folderNamePlaceholder')}
                data-testid="folder-name-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFolderDialogOpen(false)} data-testid="cancel-folder">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveFolder} data-testid="save-folder">
                {editingFolder ? t('items.update') : t('items.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('items.addNewItem')}</DialogTitle>
            <DialogDescription>{t('items.createNewInventoryItem')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            {/* Image Upload */}
            <div>
              <Label>{t('items.uploadPhoto')}</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                data-testid="button-upload-image"
              >
                <i className={`fas ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                {isAnalyzing ? t('items.analyzing') : t('controlled.takePhoto')}
              </Button>
              {uploadedImages.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {uploadedImages.map((img, idx) => (
                    <img key={idx} src={img} alt={`Upload ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="name">{t('items.itemName')} *</Label>
              <Input 
                id="name" 
                name="name" 
                required 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-item-name" 
              />
            </div>
            
            <div>
              <Label htmlFor="description">{t('items.description')}</Label>
              <Input 
                id="description" 
                name="description" 
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-item-description" 
              />
            </div>

            {/* Visual Unit Selector */}
            <div>
              <Label>{t('items.unitType')} *</Label>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUnit("pack")}
                  className={`flex-1 py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "pack" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="unit-pack"
                >
                  <i className="fas fa-box text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.pack')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUnit("ampulle")}
                  className={`flex-1 py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "ampulle" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="unit-ampulle"
                >
                  <i className="fas fa-vial text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.ampulle')}</div>
                </button>
              </div>
            </div>

            {/* <div>
              <Label htmlFor="barcode">Barcode</Label>
              <Input 
                id="barcode" 
                name="barcode" 
                value={formData.barcode}
                onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                data-testid="input-item-barcode" 
              />
            </div> */}

            <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border-2 border-primary/30">
              <Label htmlFor="initialStock" className="text-base font-semibold">{t('items.actualStock')}</Label>
              <Input 
                id="initialStock" 
                name="initialStock" 
                type="number" 
                min="0"
                value={formData.initialStock}
                onChange={(e) => setFormData(prev => ({ ...prev, initialStock: e.target.value }))}
                data-testid="input-initial-stock"
                className="mt-2 text-lg font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minThreshold">{t('items.minThreshold')}</Label>
                <Input 
                  id="minThreshold" 
                  name="minThreshold" 
                  type="number" 
                  min="0"
                  value={formData.minThreshold}
                  onChange={(e) => setFormData(prev => ({ ...prev, minThreshold: e.target.value }))}
                  data-testid="input-item-min" 
                />
              </div>
              <div>
                <Label htmlFor="maxThreshold">{t('items.maxThreshold')}</Label>
                <Input 
                  id="maxThreshold" 
                  name="maxThreshold" 
                  type="number" 
                  min="0"
                  value={formData.maxThreshold}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxThreshold: e.target.value }))}
                  data-testid="input-item-max" 
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="critical" 
                  name="critical" 
                  checked={formData.critical}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, critical: checked === true }))}
                  data-testid="checkbox-item-critical" 
                />
                <Label htmlFor="critical" className="cursor-pointer">{t('items.critical')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="controlled" 
                  name="controlled"
                  checked={formData.controlled}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, controlled: checked === true }))}
                  data-testid="checkbox-item-controlled" 
                />
                <Label htmlFor="controlled" className="cursor-pointer">{t('items.controlled')}</Label>
              </div>
            </div>

            {/* Controlled Substance Fields - Only shown for controlled pack items */}
            {selectedUnit === "pack" && formData.controlled && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border-2 border-amber-200 dark:border-amber-900/50 space-y-4">
                <div>
                  <Label htmlFor="packSize">{t('items.packSize')} *</Label>
                  <Input 
                    ref={packSizeInputRef}
                    id="packSize" 
                    name="packSize" 
                    type="number" 
                    min="1"
                    value={formData.packSize}
                    onChange={(e) => setFormData(prev => ({ ...prev, packSize: e.target.value }))}
                    data-testid="input-item-pack-size" 
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.packSizeHelp')}</p>
                </div>
                <div>
                  <Label htmlFor="controlledUnits">{t('items.controlledUnits')} *</Label>
                  <Input 
                    id="controlledUnits" 
                    name="controlledUnits" 
                    type="number" 
                    min="0"
                    value={formData.controlledUnits}
                    onChange={(e) => setFormData(prev => ({ ...prev, controlledUnits: e.target.value }))}
                    data-testid="input-item-controlled-units" 
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.controlledUnitsHelp')}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 justify-end">
              <Button type="button" variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createItemMutation.isPending || isAnalyzing} data-testid="button-save-item">
                {createItemMutation.isPending ? t('common.loading') : t('items.addItem')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('items.editItem')}</DialogTitle>
            <DialogDescription>{t('items.updateItemDetails')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateItem} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">{t('items.itemName')} *</Label>
              <Input 
                id="edit-name" 
                name="name" 
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                data-testid="input-edit-name"
              />
            </div>

            <div>
              <Label htmlFor="edit-description">{t('items.description')}</Label>
              <Input 
                id="edit-description" 
                name="description" 
                value={editFormData.description}
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-edit-description" 
              />
            </div>

            <div>
              <Label>{t('items.unitType')} *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUnit("pack")}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "pack" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="edit-unit-pack"
                >
                  <i className="fas fa-box text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.pack')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUnit("ampulle")}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "ampulle" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="edit-unit-ampulle"
                >
                  <i className="fas fa-vial text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.ampulle')}</div>
                </button>
              </div>
            </div>

            {/* <div>
              <Label htmlFor="edit-barcode">Barcode</Label>
              <Input 
                id="edit-barcode" 
                name="barcode" 
                value={editFormData.barcode}
                onChange={(e) => setEditFormData(prev => ({ ...prev, barcode: e.target.value }))}
                data-testid="input-edit-barcode" 
              />
            </div> */}

            <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border-2 border-primary/30">
              <Label htmlFor="edit-actualStock" className="text-base font-semibold">{t('items.actualStock')}</Label>
              <Input 
                id="edit-actualStock" 
                name="actualStock" 
                type="number" 
                min="0"
                value={editFormData.actualStock}
                onChange={(e) => setEditFormData(prev => ({ ...prev, actualStock: e.target.value }))}
                data-testid="input-edit-actual-stock"
                className="mt-2 text-lg font-medium"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-minThreshold">{t('items.minThreshold')}</Label>
                <Input 
                  id="edit-minThreshold" 
                  name="minThreshold" 
                  type="number" 
                  min="0"
                  value={editFormData.minThreshold}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, minThreshold: e.target.value }))}
                  data-testid="input-edit-min" 
                />
              </div>
              <div>
                <Label htmlFor="edit-maxThreshold">{t('items.maxThreshold')}</Label>
                <Input 
                  id="edit-maxThreshold" 
                  name="maxThreshold" 
                  type="number" 
                  min="0"
                  value={editFormData.maxThreshold}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, maxThreshold: e.target.value }))}
                  data-testid="input-edit-max" 
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-critical" 
                  name="critical" 
                  checked={editFormData.critical}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, critical: checked === true }))}
                  data-testid="checkbox-edit-critical" 
                />
                <Label htmlFor="edit-critical" className="cursor-pointer">{t('items.critical')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-controlled" 
                  name="controlled"
                  checked={editFormData.controlled}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, controlled: checked === true }))}
                  data-testid="checkbox-edit-controlled" 
                />
                <Label htmlFor="edit-controlled" className="cursor-pointer">{t('items.controlled')}</Label>
              </div>
            </div>

            {/* Controlled Substance Fields - Only shown for controlled pack items */}
            {selectedUnit === "pack" && editFormData.controlled && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border-2 border-amber-200 dark:border-amber-900/50 space-y-4">
                <div>
                  <Label htmlFor="edit-packSize">{t('items.packSize')} *</Label>
                  <Input 
                    ref={editPackSizeInputRef}
                    id="edit-packSize" 
                    name="packSize" 
                    type="number" 
                    min="1"
                    value={editFormData.packSize}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, packSize: e.target.value }))}
                    data-testid="input-edit-pack-size" 
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.packSizeHelp')}</p>
                </div>
                <div>
                  <Label htmlFor="edit-controlledUnits">{t('items.controlledUnits')} *</Label>
                  <Input 
                    id="edit-controlledUnits" 
                    name="controlledUnits" 
                    type="number" 
                    min="0"
                    value={editFormData.controlledUnits}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, controlledUnits: e.target.value }))}
                    data-testid="input-edit-controlled-units" 
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.controlledUnitsHelp')}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-between">
              <Button 
                type="button" 
                variant="destructive" 
                onClick={() => {
                  if (selectedItem && window.confirm(t('items.deleteConfirm'))) {
                    deleteItemMutation.mutate(selectedItem.id);
                  }
                }}
                disabled={deleteItemMutation.isPending}
                data-testid="button-delete-item"
              >
                {deleteItemMutation.isPending ? t('common.loading') : t('common.delete')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={updateItemMutation.isPending} data-testid="button-update-item">
                  {updateItemMutation.isPending ? t('common.loading') : t('common.save')}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkImportOpen} onOpenChange={setBulkImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('items.bulkImportTitle')}</DialogTitle>
            <DialogDescription>{t('items.importFromPhotos')}</DialogDescription>
          </DialogHeader>

          {bulkItems.length === 0 ? (
            <div className="space-y-4">
              <input
                type="file"
                ref={bulkFileInputRef}
                accept="image/*"
                multiple
                onChange={handleBulkImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full h-32"
                onClick={() => bulkFileInputRef.current?.click()}
                disabled={isBulkAnalyzing}
                data-testid="button-bulk-upload"
              >
                <i className={`fas ${isBulkAnalyzing ? 'fa-spinner fa-spin' : 'fa-camera'} text-4xl mr-4`}></i>
                <div>
                  <div className="font-semibold">{isBulkAnalyzing ? t('items.analyzing') : t('items.uploadImages')}</div>
                  <div className="text-sm text-muted-foreground">{t('items.uploadImages')}</div>
                </div>
              </Button>
              {bulkImages.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {bulkImages.map((img, idx) => (
                    <img key={idx} src={img} alt={`Preview ${idx + 1}`} className="w-full h-20 object-cover rounded border" />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {t('items.reviewItems')}
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {bulkItems.map((item, idx) => (
                  <div key={idx} className="p-3 border rounded-lg space-y-2" data-testid={`bulk-item-${idx}`}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">{t('items.name')}</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...bulkItems];
                            updated[idx].name = e.target.value;
                            setBulkItems(updated);
                          }}
                          data-testid={`bulk-item-name-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('items.description')}</Label>
                        <Input
                          value={item.description || ""}
                          onChange={(e) => {
                            const updated = [...bulkItems];
                            updated[idx].description = e.target.value;
                            setBulkItems(updated);
                          }}
                          data-testid={`bulk-item-description-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">{t('items.stock')}</Label>
                        <Input
                          type="number"
                          value={item.initialStock}
                          onChange={(e) => {
                            const updated = [...bulkItems];
                            updated[idx].initialStock = parseInt(e.target.value) || 0;
                            setBulkItems(updated);
                          }}
                          data-testid={`bulk-item-stock-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('items.min')}</Label>
                        <Input
                          type="number"
                          value={item.minThreshold}
                          onChange={(e) => {
                            const updated = [...bulkItems];
                            updated[idx].minThreshold = parseInt(e.target.value) || 0;
                            setBulkItems(updated);
                          }}
                          data-testid={`bulk-item-min-${idx}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('items.max')}</Label>
                        <Input
                          type="number"
                          value={item.maxThreshold}
                          onChange={(e) => {
                            const updated = [...bulkItems];
                            updated[idx].maxThreshold = parseInt(e.target.value) || 0;
                            setBulkItems(updated);
                          }}
                          data-testid={`bulk-item-max-${idx}`}
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        {item.critical && <span className="px-2 py-1 rounded bg-red-500/20 text-red-500 text-xs">{t('items.critical')}</span>}
                        {item.controlled && <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-500 text-xs">{t('items.controlled')}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setBulkItems([]); setBulkImages([]); }}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleBulkImportSave} disabled={bulkCreateMutation.isPending} data-testid="button-save-bulk-import">
                  {bulkCreateMutation.isPending ? t('items.importing') : t('items.importItems', { count: bulkItems.length })}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Onboarding Dialog */}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent data-testid="onboarding-dialog">
          <DialogHeader>
            <DialogTitle>{t('items.welcomeTitle')}</DialogTitle>
            <DialogDescription>
              {t('items.welcomeSubtitle')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary rounded-full p-2 mt-1">
                  <i className="fas fa-upload text-lg"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{t('items.bulkImportRecommended')}</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('items.bulkImportDesc')}
                  </p>
                  <Button onClick={handleStartBulkImport} className="w-full" data-testid="onboarding-bulk-import">
                    <i className="fas fa-upload mr-2"></i>
                    {t('items.startBulkImport')}
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-muted-foreground/10 text-muted-foreground rounded-full p-2 mt-1">
                  <i className="fas fa-plus text-lg"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{t('items.addItemsManually')}</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('items.addItemsManuallyDesc')}
                  </p>
                  <Button variant="outline" onClick={() => { handleDismissOnboarding(); setAddDialogOpen(true); }} className="w-full" data-testid="onboarding-add-item">
                    <i className="fas fa-plus mr-2"></i>
                    {t('items.addFirstItem')}
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={handleDismissOnboarding} data-testid="onboarding-dismiss">
                {t('items.doLater')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Upgrade Dialog */}
      {licenseInfo && (
        <UpgradeDialog
          open={upgradeDialogOpen}
          onOpenChange={setUpgradeDialogOpen}
          currentCount={licenseInfo.currentCount}
          limit={licenseInfo.limit}
          licenseType={licenseInfo.licenseType}
        />
      )}
      </div>
    </div>
  );
}
