import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UpgradeDialog from "@/components/UpgradeDialog";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import type { InsertItem, Vendor, Folder, Lot } from "@shared/schema";
import { DndContext, DragEndEvent, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderPlus, Edit2, Trash2, GripVertical, X, ArrowRightLeft, ArrowRight, ArrowLeft, Plus, Minus, Search, Loader2 } from "lucide-react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import BarcodeScanner from "@/components/BarcodeScanner";
import { CameraCapture } from "@/components/CameraCapture";
import { DirectItemCamera } from "@/components/DirectItemCamera";
import { parseGS1Code, isGS1Code } from "@/lib/gs1Parser";
import { 
  type FilterType, 
  type ItemWithStock, 
  type UnitType, 
  type ItemsProps,
  isTouchDevice, 
  parseCurrencyValue, 
  extractPackSizeFromName,
  DraggableItem,
  DroppableFolder
} from "./items";

export default function Items({ overrideUnitId, readOnly = false }: ItemsProps = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const canWriteHook = useCanWrite();
  
  const effectiveUnitId = overrideUnitId || activeHospital?.unitId;
  // Logistics module users can edit items from any unit they can view
  const hasLogisticsAccess = activeHospital?.unitType === 'logistic';
  const canWrite = canWriteHook && !readOnly && (!overrideUnitId || hasLogisticsAccess);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState("name");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saveAndCloseAdd, setSaveAndCloseAdd] = useState(true);
  const [directCameraOpen, setDirectCameraOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemWithStock | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("Pack");
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
    currentUnits: "0",
    actualStock: "0",
    critical: false,
    controlled: false,
    trackExactQuantity: false,
    imageUrl: "",
    patientPrice: "",
    dailyUsageEstimate: "",
    status: "active" as "active" | "archived",
    isInvoiceable: false,
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    minThreshold: "5",
    maxThreshold: "10",
    defaultOrderQty: "0",
    packSize: "1",
    currentUnits: "0",
    initialStock: "0",
    critical: false,
    controlled: false,
    trackExactQuantity: false,
    imageUrl: "",
    gtin: "",
    pharmacode: "",
    ean: "",
    supplierCode: "",
    migel: "",
    atc: "",
    manufacturer: "",
    lotNumber: "",
    expiryDate: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editGalleryInputRef = useRef<HTMLInputElement>(null);
  const packSizeInputRef = useRef<HTMLInputElement>(null);
  const currentUnitsInputRef = useRef<HTMLInputElement>(null);
  const initialStockInputRef = useRef<HTMLInputElement>(null);
  const editPackSizeInputRef = useRef<HTMLInputElement>(null);
  const editCurrentUnitsInputRef = useRef<HTMLInputElement>(null);
  const editActualStockInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Auto-select handler for number inputs (with workaround for browser compatibility)
  const handleNumberInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Use setTimeout to ensure selection happens after focus is complete
    // This is necessary for type="number" inputs in some browsers
    setTimeout(() => {
      e.target.select();
    }, 0);
  };
  
  // Bulk import state
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImages, setBulkImages] = useState<string[]>([]);
  const [bulkItems, setBulkItems] = useState<any[]>([]);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [bulkImportLimit, setBulkImportLimit] = useState(10); // Default to free tier limit
  
  // CSV import state
  const [importMode, setImportMode] = useState<'select' | 'image' | 'csv' | 'barcodes'>('select');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [bulkImportFolderId, setBulkImportFolderId] = useState<string | null>(null);
  
  // Import job notification state
  const [importJob, setImportJob] = useState<{
    jobId: string;
    status: 'processing' | 'completed';
    itemCount: number;
    currentImage?: number;
    progressPercent?: number;
  } | null>(null);
  
  // Bulk edit state
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [bulkEditItems, setBulkEditItems] = useState<Record<string, any>>({});
  
  // Bulk delete state
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Bulk move state
  const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = useState(false);
  const [bulkMoveTargetUnitId, setBulkMoveTargetUnitId] = useState<string>("");
  
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
  
  // Drop indicator state for visual feedback
  const [dropIndicator, setDropIndicator] = useState<{ overId: string; position: 'above' | 'below' } | null>(null);

  // Image zoom state
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [zoomImageName, setZoomImageName] = useState<string>("");

  // Edit dialog tab state
  const [editDialogTab, setEditDialogTab] = useState<string>("details");
  
  // Item codes and supplier codes state
  const [itemCodes, setItemCodes] = useState<{
    gtin?: string;
    pharmacode?: string;
    migel?: string;
    atc?: string;
    manufacturer?: string;
    packContent?: string;
    unitsPerPack?: number;
    contentPerUnit?: string;
  } | null>(null);
  const [supplierCodes, setSupplierCodes] = useState<Array<{
    id: string;
    supplierName: string;
    articleCode?: string;
    catalogUrl?: string;
    basispreis?: string;
    isPreferred: boolean;
  }>>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    supplierName: "",
    articleCode: "",
    catalogUrl: "",
    basispreis: "",
  });
  const [editingSupplier, setEditingSupplier] = useState<{
    id: string;
    supplierName: string;
    articleCode: string;
    catalogUrl: string;
    basispreis: string;
  } | null>(null);
  const [codesScanner, setCodesScanner] = useState(false);
  const [itemLots, setItemLots] = useState<Lot[]>([]);
  const [isLoadingLots, setIsLoadingLots] = useState(false);
  const [lotsScanner, setLotsScanner] = useState(false);
  const [newLot, setNewLot] = useState({ lotNumber: "", expiryDate: "" });
  const [addItemScanner, setAddItemScanner] = useState(false);
  
  // Wizard-style Add Item stages: step1 (barcode), step2 (product photo), manual (form fields)
  const [addItemStage, setAddItemStage] = useState<'step1' | 'step2' | 'manual'>('step1');
  const [isAnalyzingCodes, setIsAnalyzingCodes] = useState(false);
  const [isLookingUpGalexis, setIsLookingUpGalexis] = useState(false);
  const [galexisLookupResult, setGalexisLookupResult] = useState<{
    found: boolean; 
    message?: string; 
    noIntegration?: boolean; 
    source?: 'galexis' | 'hin';
    packSize?: number;
    basispreis?: number;
    publikumspreis?: number;
    yourPrice?: number;
    discountPercent?: number;
  } | null>(null);
  const [codesImage, setCodesImage] = useState<string | null>(null);
  const codesFileInputRef = useRef<HTMLInputElement>(null);
  const codesGalleryInputRef = useRef<HTMLInputElement>(null);
  
  // Desktop webcam capture state
  const [webcamCaptureOpen, setWebcamCaptureOpen] = useState(false);
  const [webcamCaptureTarget, setWebcamCaptureTarget] = useState<'product' | 'codes' | 'editCodes' | null>(null);
  
  // Individual barcode scan state for Add Item codes
  const [scanningCodeField, setScanningCodeField] = useState<'gtin' | 'pharmacode' | 'supplierCode' | null>(null);
  
  // Unified barcode scanner state for Add Item step 1
  
  // Edit Item codes capture state
  const [isAnalyzingEditCodes, setIsAnalyzingEditCodes] = useState(false);
  const [editCodesImage, setEditCodesImage] = useState<string | null>(null);
  const editCodesFileInputRef = useRef<HTMLInputElement>(null);
  const editCodesGalleryInputRef = useRef<HTMLInputElement>(null);
  
  // Individual barcode scan state for Edit Item codes
  const [scanningEditCodeField, setScanningEditCodeField] = useState<'gtin' | 'pharmacode' | 'migel' | 'atc' | null>(null);
  
  // Edit dialog Galexis auto-lookup state
  const [isLookingUpGalexisEdit, setIsLookingUpGalexisEdit] = useState(false);
  const [galexisEditLookupMessage, setGalexisEditLookupMessage] = useState<string | null>(null);
  const galexisEditLookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pack size confirmation dialog state
  const [packSizeConfirmDialog, setPackSizeConfirmDialog] = useState<{
    open: boolean;
    extractedSize: number;
    currentSize: number;
    mode: 'confirm_add' | 'choose_action';
  } | null>(null);
  
  // Name confirmation dialog state (for when supplier name differs from current)
  const [nameConfirmDialog, setNameConfirmDialog] = useState<{
    open: boolean;
    supplierName: string;
    currentName: string;
    selectedName: 'current' | 'supplier';
  } | null>(null);

  // Transfer items dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferDirection, setTransferDirection] = useState<'to' | 'from'>('to');
  const [transferItems, setTransferItems] = useState<Array<{
    itemId: string;
    name: string;
    packSize: number;
    trackExactQuantity: boolean;
    currentUnits: number;
    stockQty: number;
    transferType: 'packs' | 'units';
    transferQty: number;
    pharmacode?: string;
    gtin?: string;
  }>>([]);
  const [transferTargetUnitId, setTransferTargetUnitId] = useState<string>("");
  const [transferSearchTerm, setTransferSearchTerm] = useState("");
  const [transferScanner, setTransferScanner] = useState(false);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  /**
   * Custom collision detection for drag-and-drop operations.
   * 
   * Prevents items from being detected as dropping back into their source folder
   * by filtering out the parent folder from droppable containers during collision detection.
   * 
   * Strategy:
   * - Folder-to-folder dragging: Uses closestCorners for accurate reordering
   * - Item dragging: Excludes the item's current parent folder, then uses closestCorners
   *   with remaining containers to find the best drop target
   * 
   * This solves the issue where items inside expanded folders would be incorrectly
   * detected as dropping into their own folder instead of the intended target.
   */
  const customCollisionDetection = (args: any) => {
    const { active, droppableContainers } = args;
    
    // For folder-to-folder dragging, use closestCorners
    if (active.id.toString().startsWith("folder-")) {
      return closestCorners(args);
    }
    
    // For item dragging, exclude the item's current parent folder
    const activeItem = items.find(i => i.id === active.id);
    const filteredContainers = droppableContainers.filter((container: any) => {
      const containerId = container.id.toString();
      // Exclude the folder the item is currently in to prevent false positive drops
      if (activeItem?.folderId && containerId === `folder-${activeItem.folderId}`) {
        return false;
      }
      return true;
    });
    
    // Use closestCorners with filtered containers
    return closestCorners({ ...args, droppableContainers: filteredContainers });
  };

  const { data: items = [], isLoading } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}${activeFilter === 'archived' ? '&includeArchived=true' : ''}`, effectiveUnitId, activeFilter],
    enabled: !!activeHospital?.id && !!effectiveUnitId,
  });

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: [`/api/folders/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId],
    enabled: !!activeHospital?.id && !!effectiveUnitId,
  });

  // Fetch runway data for inline stock indicators
  interface RunwayItem {
    itemId: string;
    runwayDays: number | null;
    dailyUsage: number;
    status: 'stockout' | 'critical' | 'warning' | 'ok' | 'no_data';
  }
  interface RunwayData {
    items: RunwayItem[];
    targetRunway: number;
    warningDays: number;
  }
  const { data: runwayData } = useQuery<RunwayData>({
    queryKey: [`/api/items/${activeHospital?.id}/runway?unitId=${effectiveUnitId}`, effectiveUnitId],
    enabled: !!activeHospital?.id && !!effectiveUnitId,
  });

  // Create a map for quick runway lookup
  const runwayMap = useMemo(() => {
    const map = new Map<string, RunwayItem>();
    if (runwayData?.items) {
      for (const item of runwayData.items) {
        map.set(item.itemId, item);
      }
    }
    return map;
  }, [runwayData]);

  // Fetch item codes for search by pharmacode/GTIN
  const { data: itemCodesData = [] } = useQuery<{ itemId: string; gtin: string | null; pharmacode: string | null }[]>({
    queryKey: [`/api/item-codes/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId],
    enabled: !!activeHospital?.id && !!effectiveUnitId,
  });

  // Fetch all units for transfer destination selection
  interface UnitData {
    id: string;
    name: string;
    hospitalId: string;
  }
  const { data: allUnits = [] } = useQuery<UnitData[]>({
    queryKey: [`/api/units/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Filter out current unit for destination selection
  const availableDestinationUnits = useMemo(() => {
    return allUnits.filter(u => u.id !== activeHospital?.unitId);
  }, [allUnits, activeHospital?.unitId]);

  // Fetch items from source unit when transferring FROM another unit
  const { data: sourceUnitItems = [], isLoading: isLoadingSourceItems } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${transferTargetUnitId}`, transferTargetUnitId],
    enabled: !!activeHospital?.id && !!transferTargetUnitId && transferDirection === 'from',
  });

  // Fetch item codes for source unit when transferring FROM
  const { data: sourceUnitCodesData = [] } = useQuery<{ itemId: string; gtin: string | null; pharmacode: string | null }[]>({
    queryKey: [`/api/item-codes/${activeHospital?.id}?unitId=${transferTargetUnitId}`, transferTargetUnitId],
    enabled: !!activeHospital?.id && !!transferTargetUnitId && transferDirection === 'from',
  });

  // Create map of source unit item codes
  const sourceUnitCodesMap = useMemo(() => {
    const map = new Map<string, { gtin?: string; pharmacode?: string }>();
    for (const code of sourceUnitCodesData) {
      map.set(code.itemId, {
        gtin: code.gtin || undefined,
        pharmacode: code.pharmacode || undefined,
      });
    }
    return map;
  }, [sourceUnitCodesData]);

  // Create a map of itemId to codes for efficient lookup during search
  const itemCodesMap = useMemo(() => {
    const map = new Map<string, { gtin?: string; pharmacode?: string }>();
    for (const code of itemCodesData) {
      map.set(code.itemId, {
        gtin: code.gtin || undefined,
        pharmacode: code.pharmacode || undefined,
      });
    }
    return map;
  }, [itemCodesData]);

  // Get the appropriate items and codes based on transfer direction
  const transferSourceItems = transferDirection === 'from' ? sourceUnitItems : items;
  const transferSourceCodesMap = transferDirection === 'from' ? sourceUnitCodesMap : itemCodesMap;
  
  // Show onboarding when there are no items
  useEffect(() => {
    if (!isLoading && items.length === 0 && activeHospital?.id) {
      const hasSeenOnboarding = localStorage.getItem(`onboarding-seen-${activeHospital.id}`);
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }
  }, [items.length, isLoading, activeHospital?.id]);

  // Fetch bulk import limit based on hospital license
  useEffect(() => {
    if (activeHospital?.id) {
      fetch(`/api/hospitals/${activeHospital.id}/bulk-import-limit`, {
        credentials: "include"
      })
        .then(res => res.json())
        .then(data => {
          if (data.limit) {
            setBulkImportLimit(data.limit);
          }
        })
        .catch(err => {
          console.error("Failed to fetch bulk import limit:", err);
          setBulkImportLimit(10); // Default to free tier
        });
    }
  }, [activeHospital?.id]);

  // Load import job state from localStorage on mount and watch for changes
  useEffect(() => {
    if (!activeHospital?.id) return;

    const loadJobState = () => {
      const savedJob = localStorage.getItem(`import-job-${activeHospital.id}`);
      if (savedJob) {
        try {
          const job = JSON.parse(savedJob);
          setImportJob(job);
          
          // If job is completed, load the results for preview
          if (job.status === 'completed' && job.results) {
            setBulkItems(job.results);
            setIsBulkAnalyzing(false);
          }
        } catch (error) {
          console.error('Failed to parse saved import job:', error);
          localStorage.removeItem(`import-job-${activeHospital.id}`);
        }
      } else {
        setImportJob(null);
      }
    };

    // Load initially
    loadJobState();

    // Check for updates every second (BottomNav updates localStorage)
    const checkInterval = setInterval(loadJobState, 1000);

    return () => clearInterval(checkInterval);
  }, [activeHospital?.id]);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: [`/api/vendors/${activeHospital?.id}`, effectiveUnitId],
    enabled: !!activeHospital?.id,
  });

  const { data: openOrderItems = {} } = useQuery<Record<string, { totalQty: number }>>({
    queryKey: [`/api/orders/open-items/${activeHospital?.id}`, effectiveUnitId],
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
          unitId: effectiveUnitId,
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
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      resetForm();
      if (saveAndCloseAdd) {
        setAddDialogOpen(false);
      }
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
      // Update item details - include active unitId for access control
      const response = await apiRequest("PATCH", `/api/items/${selectedItem?.id}`, {
        ...data.itemData,
        activeUnitId: effectiveUnitId
      });
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
          activeUnitId: effectiveUnitId,
        });
      }
      
      return updatedItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      // Keep dialog open on save - user can close manually
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

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setIsLookingUpGalexisEdit(false);
    setGalexisEditLookupMessage(null);
    if (galexisEditLookupTimeoutRef.current) {
      clearTimeout(galexisEditLookupTimeoutRef.current);
    }
  };

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("DELETE", `/api/items/${itemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      handleCloseEditDialog();
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

  // Transfer items mutation
  const transferItemsMutation = useMutation({
    mutationFn: async (data: {
      sourceUnitId: string;
      destinationUnitId: string;
      items: Array<{
        itemId: string;
        transferType: 'packs' | 'units';
        transferQty: number;
        pharmacode?: string;
        gtin?: string;
      }>;
    }) => {
      const response = await apiRequest("POST", "/api/items/transfer", {
        ...data,
        hospitalId: activeHospital?.id,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      setTransferDialogOpen(false);
      setTransferItems([]);
      setTransferTargetUnitId("");
      setTransferDirection('to');
      toast({
        title: t('items.transferSuccess', 'Transfer Complete'),
        description: t('items.transferSuccessDesc', `Successfully transferred ${data.transferredCount || transferItems.length} item(s)`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.transferFailed', 'Failed to transfer items'),
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const response = await apiRequest("POST", "/api/items/bulk-delete", { itemIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      setIsBulkDeleteMode(false);
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
      toast({
        title: t('common.success'),
        description: `${data.deletedCount} items deleted successfully${data.failedCount > 0 ? ` (${data.failedCount} failed)` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || "Failed to delete items",
        variant: "destructive",
      });
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: async ({ itemIds, targetUnitId }: { itemIds: string[]; targetUnitId: string }) => {
      const response = await apiRequest("POST", "/api/items/bulk-move", { 
        itemIds, 
        targetUnitId,
        hospitalId: activeHospital?.id 
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      setIsBulkDeleteMode(false);
      setSelectedItems(new Set());
      setBulkMoveDialogOpen(false);
      setBulkMoveTargetUnitId("");
      toast({
        title: t('common.success'),
        description: t('items.bulkMoveSuccess', `${data.movedCount || 0} item(s) moved successfully`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.bulkMoveFailed', 'Failed to move items'),
        variant: "destructive",
      });
    },
  });

  const bulkBillableMutation = useMutation({
    mutationFn: async ({ itemIds, isBillable }: { itemIds: string[]; isBillable: boolean }) => {
      const response = await apiRequest("PATCH", "/api/items/bulk-billable", { 
        itemIds, 
        isBillable,
        hospitalId: activeHospital?.id 
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      setIsBulkDeleteMode(false);
      setSelectedItems(new Set());
      toast({
        title: t('common.success'),
        description: t('items.bulkBillableSuccess', `${data.updatedCount || 0} item(s) updated successfully`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.bulkBillableFailed', 'Failed to update items'),
        variant: "destructive",
      });
    },
  });

  const quickReduceMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("PATCH", `/api/items/${itemId}/reduce-unit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      toast({
        title: t('common.success'),
        description: "Unit reduced successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || "Failed to reduce unit",
        variant: "destructive",
      });
    },
  });

  const normalizeUnit = (unit: string | undefined | null): UnitType => {
    if (!unit) return "Single unit";
    const normalized = unit.toLowerCase();
    if (normalized === "pack" || normalized === "box" || normalized.includes("pack")) {
      return "Pack";
    }
    return "Single unit";
  };


  // Auto-calculate initial stock for Add Item when trackExactQuantity is enabled
  useEffect(() => {
    if (formData.trackExactQuantity && formData.packSize && formData.currentUnits) {
      const packSize = parseInt(formData.packSize) || 1;
      const currentUnits = parseInt(formData.currentUnits) || 0;
      const calculatedStock = Math.ceil(currentUnits / packSize);
      setFormData(prev => ({ ...prev, initialStock: String(calculatedStock) }));
    }
  }, [formData.trackExactQuantity, formData.packSize, formData.currentUnits]);

  // Auto-calculate actual stock for Edit Item when trackExactQuantity is enabled
  useEffect(() => {
    if (editFormData.trackExactQuantity && editFormData.packSize && editFormData.currentUnits) {
      const packSize = parseInt(editFormData.packSize) || 1;
      const currentUnits = parseInt(editFormData.currentUnits) || 0;
      const calculatedStock = Math.ceil(currentUnits / packSize);
      setEditFormData(prev => ({ ...prev, actualStock: String(calculatedStock) }));
    }
  }, [editFormData.trackExactQuantity, editFormData.packSize, editFormData.currentUnits]);

  // Auto-enable trackExactQuantity for controlled packed items in Add Item form
  useEffect(() => {
    if (formData.controlled && selectedUnit === "Pack" && !formData.trackExactQuantity) {
      setFormData(prev => ({ ...prev, trackExactQuantity: true }));
    }
  }, [formData.controlled, selectedUnit]);

  // Auto-enable trackExactQuantity for controlled packed items in Edit Item form
  useEffect(() => {
    if (editFormData.controlled && selectedUnit === "Pack" && !editFormData.trackExactQuantity) {
      setEditFormData(prev => ({ ...prev, trackExactQuantity: true }));
    }
  }, [editFormData.controlled, selectedUnit]);

  // Handle URL parameters for opening edit dialog
  useEffect(() => {
    if (!items.length || isLoading) return;
    
    const params = new URLSearchParams(window.location.search);
    const editItemId = params.get('editItem');
    const tab = params.get('tab');
    
    if (editItemId) {
      // Find the item
      const item = items.find(i => i.id === editItemId);
      if (item) {
        // Open edit dialog with the specified tab
        setSelectedItem(item);
        setEditFormData({
          name: item.name,
          description: item.description || "",
          barcode: item.barcodes?.[0] || "",
          minThreshold: String(item.minThreshold || 0),
          maxThreshold: String(item.maxThreshold || 0),
          defaultOrderQty: String(item.defaultOrderQty || 0),
          packSize: String(item.packSize || 1),
          currentUnits: String(item.currentUnits || 0),
          actualStock: String(item.stockLevel?.qtyOnHand || 0),
          critical: item.critical || false,
          controlled: item.controlled || false,
          trackExactQuantity: item.trackExactQuantity || false,
          imageUrl: item.imageUrl || "",
          patientPrice: item.patientPrice || "",
          dailyUsageEstimate: item.dailyUsageEstimate || "",
          status: (item.status as "active" | "archived") || "active",
          isInvoiceable: item.isInvoiceable || false,
        });
        setSelectedUnit(normalizeUnit(item.unit));
        setEditDialogTab(tab === 'codes' ? 'codes' : 'details');
        setItemCodes(null);
        setSupplierCodes([]);
        setItemLots([]);
        setNewSupplier({ supplierName: "", articleCode: "", catalogUrl: "", basispreis: "" });
        setNewLot({ lotNumber: "", expiryDate: "" });
        setEditDialogOpen(true);
        
        // Load item codes, supplier codes, and lots in background
        setIsLoadingCodes(true);
        setIsLoadingLots(true);
        Promise.all([
          fetch(`/api/items/${item.id}/codes`, { credentials: "include" }).then(res => res.json()),
          fetch(`/api/items/${item.id}/suppliers`, { credentials: "include" }).then(res => res.json()),
          fetch(`/api/items/${item.id}/lots`, { credentials: "include" }).then(res => res.json())
        ]).then(([codes, suppliers, lots]) => {
          setItemCodes(codes || null);
          setSupplierCodes(suppliers || []);
          setItemLots(lots || []);
        }).catch(err => {
          console.error('Failed to load item data:', err);
        }).finally(() => {
          setIsLoadingCodes(false);
          setIsLoadingLots(false);
        });
        
        // Clear URL params without reload (but keep pathname)
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [items, isLoading]);

  // Auto-trigger Galexis lookup when GTIN or Pharmacode changes in Edit dialog (if no suppliers exist)
  useEffect(() => {
    // Only trigger if we're in the codes tab, have an item selected, and no suppliers yet
    if (!selectedItem || !editDialogOpen || editDialogTab !== 'codes' || isLoadingCodes) return;
    if (supplierCodes.length > 0) return; // Already has suppliers
    if (isLookingUpGalexisEdit) return; // Already looking up
    
    const gtin = itemCodes?.gtin?.trim();
    const pharmacode = itemCodes?.pharmacode?.trim();
    
    // Need at least one code to lookup
    if (!gtin && !pharmacode) return;
    
    // Debounce the lookup
    if (galexisEditLookupTimeoutRef.current) {
      clearTimeout(galexisEditLookupTimeoutRef.current);
    }
    
    galexisEditLookupTimeoutRef.current = setTimeout(() => {
      lookupGalexisForEdit(gtin, pharmacode);
    }, 800); // 800ms debounce
    
    return () => {
      if (galexisEditLookupTimeoutRef.current) {
        clearTimeout(galexisEditLookupTimeoutRef.current);
      }
    };
  }, [itemCodes?.gtin, itemCodes?.pharmacode, selectedItem, editDialogOpen, editDialogTab, supplierCodes.length, isLoadingCodes]);

  const handleEditItem = async (item: ItemWithStock) => {
    setSelectedItem(item);
    setEditFormData({
      name: item.name,
      description: item.description || "",
      barcode: item.barcodes?.[0] || "",
      minThreshold: String(item.minThreshold || 0),
      maxThreshold: String(item.maxThreshold || 0),
      defaultOrderQty: String(item.defaultOrderQty || 0),
      packSize: String(item.packSize || 1),
      currentUnits: String(item.currentUnits || 0),
      actualStock: String(item.stockLevel?.qtyOnHand || 0),
      critical: item.critical || false,
      controlled: item.controlled || false,
      trackExactQuantity: item.trackExactQuantity || false,
      imageUrl: item.imageUrl || "",
      patientPrice: item.patientPrice || "",
      dailyUsageEstimate: item.dailyUsageEstimate || "",
      status: (item.status as "active" | "archived") || "active",
      isInvoiceable: item.isInvoiceable || false,
    });
    setSelectedUnit(normalizeUnit(item.unit));
    setEditDialogTab("details");
    setItemCodes(null);
    setSupplierCodes([]);
    setItemLots([]);
    setNewSupplier({ supplierName: "", articleCode: "", catalogUrl: "", basispreis: "" });
    setNewLot({ lotNumber: "", expiryDate: "" });
    setEditDialogOpen(true);
    
    // Load item codes, supplier codes, and lots in background
    setIsLoadingCodes(true);
    setIsLoadingLots(true);
    try {
      const [codesRes, suppliersRes, lotsRes] = await Promise.all([
        fetch(`/api/items/${item.id}/codes`),
        fetch(`/api/items/${item.id}/suppliers`),
        fetch(`/api/items/${item.id}/lots`)
      ]);
      
      if (codesRes.ok) {
        const codes = await codesRes.json();
        console.log('[Items] Fetched item codes:', codes);
        setItemCodes(codes);
      } else {
        console.error('[Items] Failed to fetch codes:', codesRes.status, await codesRes.text());
      }
      
      if (suppliersRes.ok) {
        const suppliers = await suppliersRes.json();
        setSupplierCodes(suppliers);
      } else {
        console.error('[Items] Failed to fetch suppliers:', suppliersRes.status);
      }
      
      if (lotsRes.ok) {
        const lots = await lotsRes.json();
        setItemLots(lots);
      } else {
        console.error('[Items] Failed to fetch lots:', lotsRes.status);
      }
    } catch (error) {
      console.error('[Items] Failed to load item codes:', error);
    } finally {
      setIsLoadingCodes(false);
      setIsLoadingLots(false);
    }
  };

  const quickOrderMutation = useMutation({
    mutationFn: async (data: { itemId: string; qty: number; packSize: number; vendorId?: string }) => {
      const response = await apiRequest("POST", "/api/orders/quick-add", {
        hospitalId: activeHospital?.id,
        unitId: effectiveUnitId,
        itemId: data.itemId,
        qty: data.qty,
        packSize: data.packSize,
        vendorId: data.vendorId || null,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${activeHospital?.id}`, effectiveUnitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/open-items/${activeHospital?.id}`, effectiveUnitId] });
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

  const createImportJobMutation = useMutation({
    mutationFn: async (images: string[]) => {
      const response = await apiRequest("POST", "/api/import-jobs", { 
        images,
        hospitalId: activeHospital?.id 
      });
      return await response.json();
    },
    onSuccess: (data) => {
      // Close dialog and show notification
      setBulkImportOpen(false);
      
      // Set initial job state - BottomNav will handle polling
      const processingJob = {
        jobId: data.jobId,
        status: 'processing' as const,
        itemCount: data.totalImages
      };
      setImportJob(processingJob);
      localStorage.setItem(`import-job-${activeHospital?.id}`, JSON.stringify(processingJob));
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
        headers: { 
          "Content-Type": "application/json",
          "X-Active-Unit-Id": effectiveUnitId || "",
        },
        body: JSON.stringify({
          items,
          hospitalId: activeHospital?.id,
          unitId: effectiveUnitId,
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
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      setBulkImportOpen(false);
      setBulkImages([]);
      setBulkItems([]);
      setImportJob(null);
      // Clear from localStorage so badge disappears
      if (activeHospital?.id) {
        localStorage.removeItem(`import-job-${activeHospital.id}`);
      }
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

  // Handler for notification click
  const handleImportNotificationClick = () => {
    if (importJob?.status === 'completed') {
      setBulkImportOpen(true);
    }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await apiRequest("PATCH", "/api/items/bulk-update", { items });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
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
    mutationFn: async ({ name, hospitalId, unitId }: { name: string; hospitalId: string; unitId: string }) => {
      const response = await apiRequest("POST", "/api/folders", {
        name,
        hospitalId,
        unitId,
      });
      return await response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${variables.hospitalId}?unitId=${variables.unitId}`, variables.unitId] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
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

  const updateFoldersSortMutation = useMutation({
    mutationFn: async (folders: { id: string; sortOrder: number }[]) => {
      const response = await apiRequest("PATCH", "/api/folders/bulk-sort", { folders });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
    },
  });


  const moveItemMutation = useMutation({
    mutationFn: async ({ itemId, folderId }: { itemId: string; folderId: string | null }) => {
      const response = await apiRequest("PATCH", `/api/items/${itemId}`, { folderId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
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

  const handleDragOver = (event: any) => {
    const { active, over } = event;
    
    if (!over || !active) {
      setDropIndicator(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Only show indicator for folder-to-folder dragging
    if (activeId.startsWith("folder-") && overId.startsWith("folder-") && activeId !== overId) {
      // Calculate position based on mouse position relative to the target
      const overRect = over.rect;
      const activeRect = active.rect.current.translated;
      
      if (overRect && activeRect) {
        const overMiddleY = overRect.top + overRect.height / 2;
        const activeMiddleY = activeRect.top + activeRect.height / 2;
        
        // If active item's center is above the over item's center, drop above; otherwise below
        const position = activeMiddleY < overMiddleY ? 'above' : 'below';
        setDropIndicator({ overId, position });
      }
    } else {
      setDropIndicator(null);
    }
  };

  const handleDragCancel = () => {
    setActiveItemId(null);
    setDropIndicator(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItemId(null);
    setDropIndicator(null);

    if (!over || active.id === over.id || !canWrite) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Handle folder reordering
    if (activeId.startsWith("folder-") && overId.startsWith("folder-")) {
      const activeFolderId = activeId.replace("folder-", "");
      const overFolderId = overId.replace("folder-", "");
      
      const folderArray = [...folders];
      const activeIndex = folderArray.findIndex(f => f.id === activeFolderId);
      const overIndex = folderArray.findIndex(f => f.id === overFolderId);
      
      if (activeIndex !== -1 && overIndex !== -1) {
        // Reorder folders
        const [movedFolder] = folderArray.splice(activeIndex, 1);
        folderArray.splice(overIndex, 0, movedFolder);
        
        // Update sort orders
        const updates = folderArray.map((folder, index) => ({
          id: folder.id,
          sortOrder: index
        }));
        
        updateFoldersSortMutation.mutate(updates);
      }
      return;
    }

    // Handle item operations - only moving to folders
    if (!activeId.startsWith("folder-")) {
      const itemId = activeId;
      
      // Move to folder or root
      if (overId === "root") {
        moveItemMutation.mutate({ itemId, folderId: null });
        return;
      } else if (overId.startsWith("folder-")) {
        const folderId = overId.replace("folder-", "");
        moveItemMutation.mutate({ itemId, folderId });
        return;
      }
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
      if (!activeHospital?.id || !effectiveUnitId) return;
      createFolderMutation.mutate({ name: folderName, hospitalId: activeHospital.id, unitId: effectiveUnitId });
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

  const handleQuickReduce = (e: React.MouseEvent, item: ItemWithStock) => {
    e.stopPropagation();
    quickReduceMutation.mutate(item.id);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const selectAllItems = () => {
    setSelectedItems(new Set(filteredItems.map(item => item.id)));
  };

  const deselectAllItems = () => {
    setSelectedItems(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedItems.size === 0) {
      toast({
        title: t('common.error'),
        description: "Please select items to delete",
        variant: "destructive",
      });
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedItems));
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const compressedImage = await compressImage(file);
    setEditFormData(prev => ({ ...prev, imageUrl: compressedImage }));

    // Auto-save the image immediately
    if (selectedItem) {
      try {
        await apiRequest("PATCH", `/api/items/${selectedItem.id}`, {
          imageUrl: compressedImage
        });
        
        queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
        
        toast({
          title: t('common.success'),
          description: t('items.imageUpdatedSuccess'),
        });
      } catch (error) {
        console.error('Failed to save image:', error);
        toast({
          title: t('common.error'),
          description: t('items.failedToUpdateImage'),
          variant: 'destructive',
        });
      }
    }
  };

  const handleUpdateItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const itemData = {
      name: editFormData.name,
      description: editFormData.description,
      unit: selectedUnit,
      barcodes: editFormData.barcode ? [editFormData.barcode] : undefined,
      minThreshold: parseInt(editFormData.minThreshold) || 0,
      maxThreshold: parseInt(editFormData.maxThreshold) || 0,
      defaultOrderQty: parseInt(editFormData.defaultOrderQty) || 0,
      packSize: (selectedUnit === "Pack" && editFormData.trackExactQuantity) ? parseInt(editFormData.packSize) || 1 : 1,
      currentUnits: (selectedUnit === "Pack" && editFormData.trackExactQuantity) ? parseInt(editFormData.currentUnits) || 0 : 0,
      trackExactQuantity: editFormData.trackExactQuantity,
      critical: editFormData.critical,
      controlled: editFormData.controlled,
      imageUrl: editFormData.imageUrl || null,
      patientPrice: editFormData.patientPrice ? editFormData.patientPrice : null,
      dailyUsageEstimate: editFormData.dailyUsageEstimate ? editFormData.dailyUsageEstimate : null,
      status: editFormData.status,
      isInvoiceable: editFormData.isInvoiceable,
    };

    // Also save codes if they exist
    if (selectedItem && itemCodes) {
      try {
        console.log('[Items] Saving item codes:', JSON.stringify(itemCodes));
        const savedCodes = await apiRequest("PUT", `/api/items/${selectedItem.id}/codes`, itemCodes);
        console.log('[Items] Saved item codes successfully:', savedCodes);
      } catch (error: any) {
        console.error("[Items] Failed to save codes:", error);
        toast({
          title: t('common.error'),
          description: "Failed to save product codes",
          variant: "destructive",
        });
      }
    }

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
              // Use GTIN as barcode if no other barcode was found
              barcode: result.barcode || result.gtin || prev.barcode,
              imageUrl: i === 0 ? compressedImage : prev.imageUrl, // Save first image as item photo
              gtin: result.gtin || prev.gtin,
              pharmacode: result.pharmacode || prev.pharmacode,
              manufacturer: result.manufacturer || prev.manufacturer,
              lotNumber: result.lotNumber || prev.lotNumber,
              expiryDate: result.expiryDate || prev.expiryDate,
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
        // Auto-advance to manual form after successful product photo OCR
        setAddItemStage('manual');
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

  // Handler for webcam capture on desktop devices
  const handleWebcamCapture = async (photo: string) => {
    setWebcamCaptureOpen(false);
    
    if (webcamCaptureTarget === 'product') {
      // Handle product photo capture (same as handleImageUpload)
      setIsAnalyzing(true);
      try {
        setUploadedImages(prev => [...prev, photo]);
        
        const response = await apiRequest('POST', '/api/items/analyze-image', {
          image: photo
        });
        const result: any = await response.json();
        
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
          barcode: result.barcode || result.gtin || prev.barcode,
          imageUrl: photo,
          gtin: result.gtin || prev.gtin,
          pharmacode: result.pharmacode || prev.pharmacode,
          manufacturer: result.manufacturer || prev.manufacturer,
          lotNumber: result.lotNumber || prev.lotNumber,
          expiryDate: result.expiryDate || prev.expiryDate,
        }));
        
        if (result.unit) {
          setSelectedUnit(result.unit as UnitType);
        }
        
        toast({
          title: t('common.success'),
          description: `${t('items.imageAnalyzed')} ${Math.round((result.confidence || 0) * 100)}% ${t('common.confidence').toLowerCase()}`,
        });
        // Auto-advance to manual form after successful product photo OCR
        setAddItemStage('manual');
      } catch (error: any) {
        toast({
          title: t('common.error'),
          description: error.message || t('items.failedToAnalyzeImage'),
          variant: "destructive",
        });
      } finally {
        setIsAnalyzing(false);
      }
    } else if (webcamCaptureTarget === 'codes') {
      // Handle codes photo capture - extract codes and trigger Galexis lookup
      setIsAnalyzingCodes(true);
      setCodesImage(photo);
      
      try {
        const response = await apiRequest('POST', '/api/items/analyze-codes', {
          image: photo
        });
        const result: any = await response.json();
        
        const extractedGtin = result.gtin || '';
        if (extractedGtin) setFormData(prev => ({ ...prev, gtin: extractedGtin }));
        if (result.pharmacode) setFormData(prev => ({ ...prev, pharmacode: result.pharmacode }));
        if (result.lotNumber) setFormData(prev => ({ ...prev, lotNumber: result.lotNumber }));
        if (result.expiryDate) setFormData(prev => ({ ...prev, expiryDate: result.expiryDate }));
        if (result.migel) setFormData(prev => ({ ...prev, migel: result.migel }));
        if (result.atc) setFormData(prev => ({ ...prev, atc: result.atc }));
        
        toast({
          title: t('common.success'),
          description: t('items.codesExtracted'),
        });
        
        // If GTIN was extracted, automatically lookup in Galexis
        if (extractedGtin) {
          await lookupGalexisProduct(extractedGtin);
        } else {
          // No GTIN found, advance to step 2 for product photo fallback
          setGalexisLookupResult({ found: false, message: t('items.noGtinExtracted') });
          setAddItemStage('step2');
        }
      } catch (error: any) {
        toast({
          title: t('common.error'),
          description: error.message || t('items.failedToExtractCodes'),
          variant: "destructive",
        });
      } finally {
        setIsAnalyzingCodes(false);
      }
    } else if (webcamCaptureTarget === 'editCodes') {
      // Handle edit codes photo capture
      setIsAnalyzingEditCodes(true);
      setEditCodesImage(photo);
      
      try {
        const response = await apiRequest('POST', '/api/items/analyze-codes', {
          image: photo
        });
        const result: any = await response.json();
        
        if (result.gtin) setFormData(prev => ({ ...prev, gtin: result.gtin }));
        if (result.pharmacode) setFormData(prev => ({ ...prev, pharmacode: result.pharmacode }));
        if (result.lotNumber) setFormData(prev => ({ ...prev, lotNumber: result.lotNumber }));
        if (result.expiryDate) setFormData(prev => ({ ...prev, expiryDate: result.expiryDate }));
        if (result.migel) setFormData(prev => ({ ...prev, migel: result.migel }));
        if (result.atc) setFormData(prev => ({ ...prev, atc: result.atc }));
        
        toast({
          title: t('common.success'),
          description: t('items.codesExtracted'),
        });
      } catch (error: any) {
        toast({
          title: t('common.error'),
          description: error.message || t('items.failedToExtractCodes'),
          variant: "destructive",
        });
      } finally {
        setIsAnalyzingEditCodes(false);
      }
    }
    
    setWebcamCaptureTarget(null);
  };

  // Open webcam or file input based on device type
  const handleTakePhoto = (target: 'product' | 'codes' | 'editCodes') => {
    if (isTouchDevice()) {
      // Mobile/tablet: use native file input with camera capture
      if (target === 'product') {
        fileInputRef.current?.click();
      } else if (target === 'codes') {
        codesFileInputRef.current?.click();
      } else if (target === 'editCodes') {
        editCodesFileInputRef.current?.click();
      }
    } else {
      // Desktop: use webcam capture component
      setWebcamCaptureTarget(target);
      setWebcamCaptureOpen(true);
    }
  };
  
  // Handler for direct barcode detection from unified scanner
  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const itemData = {
      name: formData.name,
      description: formData.description,
      unit: selectedUnit,
      barcodes: formData.barcode ? [formData.barcode] : undefined,
      minThreshold: parseInt(formData.minThreshold) || 0,
      maxThreshold: parseInt(formData.maxThreshold) || 0,
      defaultOrderQty: parseInt(formData.defaultOrderQty) || 0,
      packSize: (selectedUnit === "Pack" && formData.trackExactQuantity) ? parseInt(formData.packSize) || 1 : 1,
      currentUnits: (selectedUnit === "Pack" && formData.trackExactQuantity) ? parseInt(formData.currentUnits) || 0 : 0,
      trackExactQuantity: formData.trackExactQuantity,
      critical: formData.critical,
      controlled: formData.controlled,
      initialStock: parseInt(formData.initialStock) || 0,
      imageUrl: formData.imageUrl || undefined,
    };
    
    // Capture codes data BEFORE mutate (mutation's onSuccess calls resetForm which clears formData)
    // Include unitsPerPack from galexis lookup if available
    const codesData: any = {
      gtin: formData.gtin || null,
      pharmacode: formData.pharmacode || null,
      migel: formData.migel || null,
      atc: formData.atc || null,
      manufacturer: formData.manufacturer || null,
    };
    // Add unitsPerPack from Galexis/HIN lookup if available
    if (galexisLookupResult?.packSize) {
      codesData.unitsPerPack = galexisLookupResult.packSize;
    }
    const hasCodes = formData.gtin || formData.pharmacode || formData.migel || formData.atc || formData.manufacturer || galexisLookupResult?.packSize;
    
    // Capture supplier data from Galexis/HIN lookup for auto-creating supplier code
    const galexisSupplierData = galexisLookupResult?.found && galexisLookupResult?.basispreis ? {
      supplierName: galexisLookupResult.source === 'hin' ? 'HIN' : 'Galexis',
      articleCode: formData.pharmacode || formData.gtin || '',
      basispreis: String(galexisLookupResult.basispreis),
      publikumspreis: galexisLookupResult.publikumspreis ? String(galexisLookupResult.publikumspreis) : undefined,
      isPreferred: true,
      catalogUrl: formData.pharmacode 
        ? `https://dispocura.galexis.com/app#/articles/${formData.pharmacode}` 
        : undefined,
    } : null;
    
    const lotData = formData.lotNumber ? {
      lotNumber: formData.lotNumber,
      expiryDate: formData.expiryDate ? new Date(formData.expiryDate).toISOString() : null,
    } : null;

    createItemMutation.mutate(itemData, {
      onSuccess: async (createdItem) => {
        if (!createdItem) return;
        
        // Save item codes if any were extracted (using captured data)
        if (hasCodes) {
          try {
            await apiRequest("PUT", `/api/items/${createdItem.id}/codes`, codesData);
            toast({
              title: "Product codes saved",
              description: "GTIN/Pharmacode and other codes have been saved",
            });
          } catch (error: any) {
            console.error('Failed to save item codes:', error);
            toast({
              title: "Warning: Codes not saved",
              description: error.message || "Failed to save product codes",
              variant: "destructive",
            });
          }
        }
        
        // Auto-create supplier code with Galexis/HIN price data
        if (galexisSupplierData) {
          try {
            await apiRequest("POST", `/api/items/${createdItem.id}/supplier-codes`, galexisSupplierData);
            toast({
              title: t('items.supplierAdded', 'Supplier added'),
              description: `${galexisSupplierData.supplierName}: ${galexisSupplierData.basispreis} CHF`,
            });
          } catch (error: any) {
            console.error('Failed to create supplier code:', error);
            // Don't show error toast for supplier - it's auto-created
          }
        }
        
        // Create lot if lot number was extracted (using captured data)
        if (lotData) {
          try {
            await apiRequest("POST", `/api/items/${createdItem.id}/lots`, {
              itemId: createdItem.id,
              unitId: effectiveUnitId,
              ...lotData,
            });
            toast({
              title: "Lot created",
              description: `LOT: ${lotData.lotNumber}${lotData.expiryDate ? ` (Exp: ${new Date(lotData.expiryDate).toLocaleDateString()})` : ''}`,
            });
          } catch (error: any) {
            console.error('Failed to create lot:', error);
            toast({
              title: "Warning: Lot not saved",
              description: error.message || "Failed to create lot record",
              variant: "destructive",
            });
          }
        }
      }
    });
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
      currentUnits: "0",
      initialStock: "0",
      critical: false,
      controlled: false,
      trackExactQuantity: false,
      imageUrl: "",
      gtin: "",
      pharmacode: "",
      ean: "",
      supplierCode: "",
      migel: "",
      atc: "",
      manufacturer: "",
      lotNumber: "",
      expiryDate: "",
    });
    setSelectedUnit("Pack");
    setUploadedImages([]);
    setAddItemStage('step1');
    setCodesImage(null);
    setScanningCodeField(null);
    setGalexisLookupResult(null);
    setIsLookingUpGalexis(false);
  };
  
  // Galexis product lookup by GTIN
  const lookupGalexisProduct = async (gtin: string) => {
    if (!gtin || !activeHospital?.id) return;
    
    setIsLookingUpGalexis(true);
    setGalexisLookupResult(null);
    
    try {
      const response = await apiRequest('POST', '/api/items/galexis-lookup', {
        gtin,
        hospitalId: activeHospital.id,
        unitId: effectiveUnitId,
      });
      const result: any = await response.json();
      
      // Check if item with same code already exists in this unit
      if (result.existingItem) {
        setGalexisLookupResult({ 
          found: false, 
          message: t('items.duplicateCodeExists', `Item "${result.existingItem.itemName}" already has this code`),
        });
        toast({
          title: t('items.duplicateCodeFound', 'Duplicate Code Found'),
          description: t('items.duplicateCodeDesc', `An item "${result.existingItem.itemName}" already has this code`),
          variant: "destructive",
        });
        setIsLookingUpGalexis(false);
        return;
      }
      
      if (result.found) {
        // Auto-populate form with Galexis data including pack size if available
        setFormData(prev => ({
          ...prev,
          name: result.name || prev.name,
          pharmacode: result.pharmacode || prev.pharmacode,
          gtin: result.gtin || prev.gtin,
          packSize: result.packSize ? String(result.packSize) : prev.packSize,
        }));
        
        // Store lookup result with pack size and price info for use when creating item
        setGalexisLookupResult({ 
          found: true, 
          source: result.source || 'galexis',
          packSize: result.packSize,
          basispreis: result.basispreis,
          publikumspreis: result.publikumspreis,
          yourPrice: result.yourPrice,
          discountPercent: result.discountPercent,
        });
        // Auto-advance to manual form with populated fields
        setAddItemStage('manual');
        
        toast({
          title: result.source === 'hin' ? t('items.hinProductFound') : t('items.galexisProductFound'),
          description: result.name,
        });
      } else {
        setGalexisLookupResult({ 
          found: false, 
          message: result.message,
          noIntegration: result.noIntegration 
        });
        // Advance to step 2 for product photo OCR
        setAddItemStage('step2');
        
        // Show step 2 option for manual name entry
        if (!result.noIntegration) {
          toast({
            title: t('items.galexisProductNotFound'),
            description: t('items.useStep2ForName'),
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      setGalexisLookupResult({ found: false, message: error.message });
      toast({
        title: t('items.galexisLookupFailed'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLookingUpGalexis(false);
    }
  };
  
  // Galexis product lookup for Edit Item dialog - auto-adds supplier when found
  const lookupGalexisForEdit = async (gtin?: string, pharmacode?: string) => {
    if ((!gtin && !pharmacode) || !activeHospital?.id || !selectedItem) return;
    
    setIsLookingUpGalexisEdit(true);
    setGalexisEditLookupMessage(t('items.lookingUpGalexis', 'Looking up in Galexis...'));
    
    try {
      const response = await apiRequest('POST', '/api/items/galexis-lookup', {
        gtin: gtin || undefined,
        pharmacode: pharmacode || undefined,
        hospitalId: activeHospital.id,
        unitId: effectiveUnitId,
      });
      const result: any = await response.json();
      
      // Check if item with same code already exists in this unit (excluding current item)
      if (result.existingItem && result.existingItem.itemId !== selectedItem.id) {
        toast({
          title: t('items.duplicateCodeFound', 'Duplicate Code Found'),
          description: t('items.duplicateCodeDesc', `An item "${result.existingItem.itemName}" already has this code`),
          variant: "destructive",
        });
        setGalexisEditLookupMessage(t('items.duplicateCodeExists', `Item "${result.existingItem.itemName}" already has this code`));
        setIsLookingUpGalexisEdit(false);
        return;
      }
      
      // Check if supplier with same code already exists for this item
      const existingSupplier = supplierCodes.find(
        s => s.articleCode === (result.pharmacode || pharmacode)
      );
      if (existingSupplier) {
        setGalexisEditLookupMessage(t('items.supplierAlreadyExists', `${existingSupplier.supplierName} supplier already exists with this code`));
        setIsLookingUpGalexisEdit(false);
        return;
      }
      
      if (result.found) {
        // Handle GTIN: fill if empty, alert if different
        const returnedGtin = result.gtin;
        const currentGtin = itemCodes?.gtin;
        
        if (returnedGtin) {
          if (!currentGtin) {
            // Fill back GTIN if empty
            setItemCodes(prev => ({ ...prev, gtin: returnedGtin }));
            toast({
              title: t('items.gtinAutoFilled', 'GTIN Auto-filled'),
              description: `GTIN: ${returnedGtin}`,
            });
          } else if (currentGtin !== returnedGtin) {
            // Alert if GTIN is different
            toast({
              title: t('items.gtinMismatch', 'GTIN Mismatch'),
              description: t('items.gtinMismatchDesc', 'The returned GTIN ({{returned}}) differs from current ({{current}})', { returned: returnedGtin, current: currentGtin }),
              variant: "destructive",
            });
          }
        }
        
        // Auto-add supplier with Galexis data
        // Use basispreis (base price) or yourPrice (customer-specific price) from Galexis response
        const priceValue = result.yourPrice || result.basispreis;
        const supplierData = {
          supplierName: result.supplierName || 'Galexis',
          articleCode: result.pharmacode || pharmacode || null,
          catalogUrl: result.catalogUrl || null,
          basispreis: priceValue ? String(priceValue) : null,
          isPreferred: supplierCodes.length === 0,
        };
        
        try {
          const createRes = await apiRequest("POST", `/api/items/${selectedItem.id}/suppliers`, supplierData);
          const created = await createRes.json();
          setSupplierCodes(prev => [...prev, created]);
          
          // Check if supplier name differs from current item name
          if (result.name && selectedItem.name && selectedItem.name !== 'New Item') {
            const supplierNameNormalized = result.name.trim().toLowerCase();
            const currentNameNormalized = selectedItem.name.trim().toLowerCase();
            
            if (supplierNameNormalized !== currentNameNormalized) {
              // Names are different - show confirmation dialog
              setNameConfirmDialog({
                open: true,
                supplierName: result.name,
                currentName: selectedItem.name,
                selectedName: 'current',
              });
            }
          } else if (result.name && (!selectedItem.name || selectedItem.name === 'New Item')) {
            // Auto-update if name was empty or generic
            setEditFormData(prev => ({ ...prev, name: result.name }));
          }
          
          // Update manufacturer if found
          if (result.manufacturer) {
            setItemCodes(prev => ({ ...prev, manufacturer: result.manufacturer }));
          }
          
          // Extract pack size from product name/description
          const extractedPackSize = extractPackSizeFromName(result.name);
          const currentPackSize = parseInt(editFormData.packSize) || 0;
          
          if (extractedPackSize && extractedPackSize > 0) {
            if (currentPackSize === 0 || currentPackSize === 1) {
              // Pack size is empty/default (1) - ask for confirmation to add
              setPackSizeConfirmDialog({
                open: true,
                extractedSize: extractedPackSize,
                currentSize: currentPackSize,
                mode: 'confirm_add',
              });
            } else if (currentPackSize !== extractedPackSize) {
              // Pack size is different - ask for action
              setPackSizeConfirmDialog({
                open: true,
                extractedSize: extractedPackSize,
                currentSize: currentPackSize,
                mode: 'choose_action',
              });
            }
            // If same, do nothing
          }
          
          setGalexisEditLookupMessage(null);
          toast({
            title: t('items.galexisProductFound'),
            description: t('items.supplierAutoAdded', 'Supplier info added from Galexis'),
          });
        } catch (supplierError: any) {
          console.error('Failed to add supplier from Galexis:', supplierError);
          setGalexisEditLookupMessage(null);
        }
      } else {
        // No result found or no integration
        setGalexisEditLookupMessage(
          result.noIntegration 
            ? t('items.galexisNotConfigured', 'Galexis not configured') 
            : t('items.galexisProductNotFound', 'Product not found in Galexis')
        );
        // Clear message after 3 seconds
        setTimeout(() => setGalexisEditLookupMessage(null), 3000);
      }
    } catch (error: any) {
      console.error('Galexis lookup error:', error);
      setGalexisEditLookupMessage(null);
    } finally {
      setIsLookingUpGalexisEdit(false);
    }
  };
  
  // Handler for Step 1: Codes image extraction (primary step)
  const handleCodesImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingCodes(true);
    
    try {
      const compressedImage = await compressImage(file);
      setCodesImage(compressedImage);
      
      // Analyze image for codes
      const response = await apiRequest('POST', '/api/items/analyze-codes', {
        image: compressedImage
      });
      const result: any = await response.json();
      
      // Update form with extracted codes
      const extractedGtin = result.gtin || '';
      setFormData(prev => ({
        ...prev,
        gtin: extractedGtin || prev.gtin,
        pharmacode: result.pharmacode || prev.pharmacode,
        ean: result.ean || prev.ean,
        supplierCode: result.supplierCode || prev.supplierCode,
        lotNumber: result.lotNumber || prev.lotNumber,
        expiryDate: result.expiryDate || prev.expiryDate,
      }));
      
      toast({
        title: t('items.codesExtracted'),
        description: `${t('common.confidence')}: ${Math.round((result.confidence || 0) * 100)}%`,
      });
      
      // If GTIN was extracted, automatically lookup in Galexis
      if (extractedGtin) {
        await lookupGalexisProduct(extractedGtin);
      } else {
        // No GTIN found, advance to step 2 for product photo fallback
        setGalexisLookupResult({ found: false, message: t('items.noGtinExtracted') });
        setAddItemStage('step2');
      }
    } catch (error: any) {
      toast({
        title: t('items.codesExtractionFailed'),
        description: error.message || t('items.failedToExtractCodes'),
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingCodes(false);
      e.target.value = '';
    }
  };
  
  // Handler for individual barcode scan result in Add Item
  const handleAddItemCodeScan = (code: string) => {
    if (!scanningCodeField) return;
    
    setFormData(prev => ({
      ...prev,
      [scanningCodeField]: code
    }));
    
    toast({
      title: t('items.codeCaptured'),
      description: `${scanningCodeField.toUpperCase()}: ${code}`,
    });
    
    setScanningCodeField(null);
  };
  
  // Handler for Edit Item codes image extraction
  const handleEditCodesImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingEditCodes(true);
    
    try {
      const compressedImage = await compressImage(file);
      setEditCodesImage(compressedImage);
      
      // Analyze image for codes
      const response = await apiRequest('POST', '/api/items/analyze-codes', {
        image: compressedImage
      });
      const result: any = await response.json();
      
      // Update itemCodes with extracted codes (gtin, pharmacode, manufacturer are the main scannable codes)
      setItemCodes(prev => ({
        ...prev,
        gtin: result.gtin || prev?.gtin,
        pharmacode: result.pharmacode || prev?.pharmacode,
        manufacturer: result.manufacturer || prev?.manufacturer,
      }));
      
      // If lot/expiry was extracted, update the newLot state for easy addition
      if (result.lotNumber || result.expiryDate) {
        setNewLot(prev => ({
          lotNumber: result.lotNumber || prev.lotNumber,
          expiryDate: result.expiryDate || prev.expiryDate,
        }));
      }
      
      const extractedFields: string[] = [];
      if (result.gtin) extractedFields.push('GTIN');
      if (result.pharmacode) extractedFields.push('Pharmacode');
      if (result.manufacturer) extractedFields.push('Manufacturer');
      if (result.lotNumber) extractedFields.push('LOT');
      if (result.expiryDate) extractedFields.push('Expiry');
      
      toast({
        title: t('items.codesExtracted'),
        description: extractedFields.length > 0 
          ? `${extractedFields.join(', ')} (${Math.round((result.confidence || 0) * 100)}%)`
          : `${t('common.confidence')}: ${Math.round((result.confidence || 0) * 100)}%`,
      });
    } catch (error: any) {
      toast({
        title: t('items.codesExtractionFailed'),
        description: error.message || t('items.failedToExtractCodes'),
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingEditCodes(false);
      e.target.value = '';
    }
  };
  
  // Handler for individual barcode scan result in Edit Item codes
  const handleEditItemCodeScan = (code: string) => {
    if (!scanningEditCodeField) return;
    
    setItemCodes(prev => ({
      ...prev,
      [scanningEditCodeField]: code
    }));
    
    toast({
      title: t('items.codeCaptured'),
      description: `${scanningEditCodeField.toUpperCase()}: ${code}`,
    });
    
    setScanningEditCodeField(null);
  };

  const handleDownloadInventory = () => {
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    
    const folderMap = new Map<string, Folder>();
    folders.forEach(folder => folderMap.set(folder.id, folder));

    // Filter out archived items
    const activeItems = items.filter(item => item.status !== 'archived');

    const sortedItems = [...activeItems].sort((a, b) => {
      const aFolder = a.folderId ? folderMap.get(a.folderId) : null;
      const bFolder = b.folderId ? folderMap.get(b.folderId) : null;
      const aFolderName = aFolder?.name || "Uncategorized";
      const bFolderName = bFolder?.name || "Uncategorized";
      
      if (aFolderName !== bFolderName) {
        return aFolderName.localeCompare(bFolderName);
      }
      
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    // Header
    doc.setFontSize(18);
    doc.text("INVENTORY LIST", 105, 15, { align: "center" });
    
    doc.setFontSize(10);
    const hospitalName = activeHospital?.name || "Hospital";
    const exportDate = new Date().toLocaleDateString('en-GB');
    doc.text(`Hospital: ${hospitalName}`, 20, 25);
    doc.text(`Date: ${exportDate}`, 150, 25);

    // Build table data with folder grouping
    const tableData: any[] = [];
    let currentFolder = "";

    sortedItems.forEach(item => {
      const folder = item.folderId ? folderMap.get(item.folderId) : null;
      const folderName = folder?.name || "Uncategorized";
      const stockQty = item.stockLevel?.qtyOnHand || 0;
      
      // Add folder header row when folder changes
      if (folderName !== currentFolder) {
        currentFolder = folderName;
        tableData.push([
          { content: folderName.toUpperCase(), colSpan: 6, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] } }
        ]);
      }
      
      // Build row data based on item type and trackExactQuantity setting
      const isPack = item.unit === "Pack";
      const tracksExact = item.trackExactQuantity && isPack;
      
      // Current Stock: when trackExactQuantity is enabled, calculate from currentUnits
      // Otherwise, use qtyOnHand directly
      let displayStock = stockQty;
      if (tracksExact && item.packSize && item.packSize > 0) {
        displayStock = Math.ceil((item.currentUnits || 0) / item.packSize);
      }
      const stockLabel = isPack ? `${displayStock} packs` : `${displayStock} units`;
      
      // Pack Size: only show if Pack AND trackExactQuantity is enabled
      const packSizeValue = tracksExact ? String(item.packSize || 1) : "-";
      
      // Current Items: only show currentUnits if Pack AND trackExactQuantity is enabled
      const currentItemsValue = tracksExact ? String(item.currentUnits || 0) : "-";
      
      const row = [
        item.name,
        stockLabel,
        packSizeValue,
        currentItemsValue,
      ];

      row.push(
        String(item.minThreshold || 0),
        String(item.maxThreshold || 0)
      );

      tableData.push(row);
    });

    // Create table
    autoTable(doc, {
      startY: 30,
      head: [[
        "Item Name",
        "Current Stock",
        "Pack Size",
        "Current Items",
        "Min",
        "Max"
      ]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 74 },  // Item Name
        1: { cellWidth: 34 },  // Current Stock
        2: { cellWidth: 20, halign: "center" },  // Pack Size
        3: { cellWidth: 26, halign: "center" },  // Current Items
        4: { cellWidth: 18, halign: "center" },  // Min
        5: { cellWidth: 18, halign: "center" },  // Max
      },
      margin: { left: 10, right: 10 },
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Page ${i} of ${pageCount}`,
        105,
        285,
        { align: "center" }
      );
    }

    // Sanitize hospital name for filename
    const sanitizedHospitalName = hospitalName.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `inventory-${sanitizedHospitalName}-${new Date().toISOString().split('T')[0]}.pdf`;
    
    doc.save(filename);

    toast({
      title: "Inventory Exported",
      description: `Downloaded ${activeItems.length} items organized by folder as PDF.`,
    });
  };

  const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Check if it's a CSV or Excel file
    const firstFile = files[0];
    const fileName = firstFile.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
      handleCsvUpload(firstFile);
      e.target.value = '';
      return;
    }
    
    // Handle Excel files (.xlsx, .xls)
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      await handleExcelUpload(firstFile);
      e.target.value = '';
      return;
    }
    
    // Handle image files
    if (files.length > bulkImportLimit) {
      toast({
        title: t('items.tooManyImages'),
        description: t('items.maxImagesAllowed', { count: bulkImportLimit }),
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
      setImportMode('image');
      await createImportJobMutation.mutateAsync(images);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to process images",
        variant: "destructive",
      });
      setIsBulkAnalyzing(false);
    } finally {
      e.target.value = '';
    }
  };

  const handleBarcodeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    if (files.length > bulkImportLimit) {
      toast({
        title: t('items.tooManyImages'),
        description: t('items.maxImagesAllowed', { count: bulkImportLimit }),
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
      setImportMode('barcodes');
      
      // Call the bulk codes analysis endpoint
      const response = await apiRequest('POST', '/api/items/analyze-bulk-codes', {
        images,
        hospitalId: activeHospital?.id,
      });
      const result = await response.json();
      
      if (result.items && Array.isArray(result.items)) {
        // Map to bulkItems format
        const items = result.items.map((item: any, idx: number) => {
          // Build barcodes array from GTIN and pharmacode
          const barcodes: string[] = [];
          if (item.gtin) barcodes.push(item.gtin);
          if (item.pharmacode) barcodes.push(item.pharmacode);
          
          return {
            name: item.name || '',
            description: item.description || '',
            gtin: item.gtin || '',
            pharmacode: item.pharmacode || '',
            barcodes,
            basispreis: item.basispreis,
            publikumspreis: item.publikumspreis,
            yourPrice: item.yourPrice,
            available: item.available,
            source: item.source || 'ocr',
            galexisFound: item.galexisFound || false,
            error: item.error,
            unit: 'Pack',
            initialStock: 0,
            minThreshold: 1,
            maxThreshold: 10,
            critical: false,
            controlled: false,
            selected: !item.error && item.name,
          };
        });
        setBulkItems(items);
        
        const foundCount = items.filter((i: any) => i.galexisFound).length;
        toast({
          title: t('common.success'),
          description: t('items.bulkCodesAnalyzed', { total: items.length, found: foundCount }),
        });
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToAnalyzeBarcodes'),
        variant: "destructive",
      });
    } finally {
      setIsBulkAnalyzing(false);
      e.target.value = '';
    }
  };
  
  const handleCsvUpload = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          toast({
            title: "Empty CSV",
            description: "The CSV file appears to be empty",
            variant: "destructive",
          });
          return;
        }
        
        const headers = results.meta.fields || [];
        setCsvHeaders(headers);
        setCsvData(results.data);
        setImportMode('csv');
        
        // Auto-map common column names
        const autoMapping: Record<string, string> = {};
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase().trim();
          if (lowerHeader === 'name' || lowerHeader === 'item name' || lowerHeader === 'product name') {
            autoMapping[header] = 'name';
          } else if (lowerHeader === 'description' || lowerHeader === 'desc') {
            autoMapping[header] = 'description';
          } else if (lowerHeader === 'stock' || lowerHeader === 'quantity' || lowerHeader === 'initial stock') {
            autoMapping[header] = 'initialStock';
          } else if (lowerHeader === 'min' || lowerHeader === 'min threshold' || lowerHeader === 'minimum') {
            autoMapping[header] = 'minThreshold';
          } else if (lowerHeader === 'max' || lowerHeader === 'max threshold' || lowerHeader === 'maximum') {
            autoMapping[header] = 'maxThreshold';
          } else if (lowerHeader === 'unit' || lowerHeader === 'order unit') {
            autoMapping[header] = 'unit';
          } else if (lowerHeader === 'critical') {
            autoMapping[header] = 'critical';
          } else if (lowerHeader === 'controlled') {
            autoMapping[header] = 'controlled';
          } else if (lowerHeader === 'pack size' || lowerHeader === 'packsize') {
            autoMapping[header] = 'packSize';
          }
          // Medication-specific fields
          else if (lowerHeader === 'group' || lowerHeader === 'medication group' || lowerHeader === 'drug group') {
            autoMapping[header] = 'medicationGroup';
          } else if (lowerHeader === 'route' || lowerHeader === 'administration route') {
            autoMapping[header] = 'administrationRoute';
          } else if (lowerHeader === 'defaultdose' || lowerHeader === 'default dose') {
            autoMapping[header] = 'defaultDose';
          } else if (lowerHeader === 'ampoulequantity' || lowerHeader === 'ampule quantity' || lowerHeader === 'ampoule quantity') {
            autoMapping[header] = 'ampuleQuantity';
          } else if (lowerHeader === 'ampouleunit' || lowerHeader === 'ampule unit' || lowerHeader === 'ampoule unit') {
            autoMapping[header] = 'ampuleUnit';
          } else if (lowerHeader === 'administrationunit' || lowerHeader === 'administration unit') {
            autoMapping[header] = 'administrationUnit';
          } else if (lowerHeader === 'rateunit' || lowerHeader === 'rate unit') {
            autoMapping[header] = 'rateUnit';
          }
          // Additional fields for full catalog export/import
          else if (lowerHeader === 'barcode' || lowerHeader === 'sku') {
            autoMapping[header] = 'barcode';
          } else if (lowerHeader === 'folderpath' || lowerHeader === 'folder path' || lowerHeader === 'folder' || lowerHeader === 'foldername' || lowerHeader === 'folder name') {
            autoMapping[header] = 'folderPath';
          } else if (lowerHeader === 'vendorname' || lowerHeader === 'vendor name' || lowerHeader === 'vendor') {
            autoMapping[header] = 'vendorName';
          } else if (lowerHeader === 'currentunits' || lowerHeader === 'current units' || lowerHeader === 'current stock') {
            autoMapping[header] = 'currentUnits';
          } else if (lowerHeader === 'reorderpoint' || lowerHeader === 'reorder point') {
            autoMapping[header] = 'reorderPoint';
          } else if (lowerHeader === 'trackexactquantity' || lowerHeader === 'track exact quantity' || lowerHeader === 'exact quantity') {
            autoMapping[header] = 'trackExactQuantity';
          } else if (lowerHeader === 'minunits' || lowerHeader === 'min units') {
            autoMapping[header] = 'minUnits';
          } else if (lowerHeader === 'maxunits' || lowerHeader === 'max units') {
            autoMapping[header] = 'maxUnits';
          } else if (lowerHeader === 'imageurl' || lowerHeader === 'image url' || lowerHeader === 'image') {
            autoMapping[header] = 'imageUrl';
          } else if (lowerHeader === 'barcodes') {
            autoMapping[header] = 'barcodes';
          }
          // Item codes fields for catalog transfer
          else if (lowerHeader === 'gtin' || lowerHeader === 'ean' || lowerHeader === 'gtin/ean') {
            autoMapping[header] = 'gtin';
          } else if (lowerHeader === 'pharmacode') {
            autoMapping[header] = 'pharmacode';
          } else if (lowerHeader === 'swissmedicnr' || lowerHeader === 'swissmedic' || lowerHeader === 'swissmedic nr') {
            autoMapping[header] = 'swissmedicNr';
          } else if (lowerHeader === 'migel' || lowerHeader === 'migel nr') {
            autoMapping[header] = 'migel';
          } else if (lowerHeader === 'atc' || lowerHeader === 'atc code') {
            autoMapping[header] = 'atc';
          } else if (lowerHeader === 'manufacturer' || lowerHeader === 'hersteller') {
            autoMapping[header] = 'manufacturer';
          } else if (lowerHeader === 'manufacturerref' || lowerHeader === 'manufacturer ref' || lowerHeader === 'ref' || lowerHeader === 'artikelnr') {
            autoMapping[header] = 'manufacturerRef';
          } else if (lowerHeader === 'packcontent' || lowerHeader === 'pack content') {
            autoMapping[header] = 'packContent';
          } else if (lowerHeader === 'unitsperpack' || lowerHeader === 'units per pack') {
            autoMapping[header] = 'unitsPerPack';
          } else if (lowerHeader === 'contentperunit' || lowerHeader === 'content per unit') {
            autoMapping[header] = 'contentPerUnit';
          } else if (lowerHeader === 'abgabekategorie' || lowerHeader === 'abgabe' || lowerHeader === 'dispensation category') {
            autoMapping[header] = 'abgabekategorie';
          }
          // Supplier fields
          else if (lowerHeader === 'preferredsupplier' || lowerHeader === 'preferred supplier' || lowerHeader === 'supplier') {
            autoMapping[header] = 'preferredSupplier';
          } else if (lowerHeader === 'supplierarticlecode' || lowerHeader === 'supplier article code' || lowerHeader === 'article code') {
            autoMapping[header] = 'supplierArticleCode';
          } else if (lowerHeader === 'supplierprice' || lowerHeader === 'supplier price' || lowerHeader === 'price') {
            autoMapping[header] = 'supplierPrice';
          }
        });
        setCsvMapping(autoMapping);
      },
      error: (error) => {
        toast({
          title: "CSV Parse Error",
          description: error.message || "Failed to parse CSV file",
          variant: "destructive",
        });
      }
    });
  };
  
  const handleExcelUpload = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount === 0) {
        toast({
          title: "Empty Excel File",
          description: "The Excel file appears to be empty",
          variant: "destructive",
        });
        return;
      }
      
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value || '');
      });
      
      const jsonData: Record<string, any>[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value ?? '';
          }
        });
        if (Object.keys(rowData).length > 0) {
          jsonData.push(rowData);
        }
      });
      
      if (jsonData.length === 0) {
        toast({
          title: "Empty Excel File",
          description: "The Excel file appears to be empty",
          variant: "destructive",
        });
        return;
      }
      
      setCsvHeaders(headers.filter(h => h));
      setCsvData(jsonData);
      setImportMode('csv');
      
      const autoMapping: Record<string, string> = {};
      headers.forEach(header => {
        if (!header) return;
        const lowerHeader = header.toLowerCase().trim();
        if (lowerHeader === 'name' || lowerHeader === 'item name' || lowerHeader === 'product name') {
          autoMapping[header] = 'name';
        } else if (lowerHeader === 'description' || lowerHeader === 'desc') {
          autoMapping[header] = 'description';
        } else if (lowerHeader === 'stock' || lowerHeader === 'quantity' || lowerHeader === 'initial stock') {
          autoMapping[header] = 'initialStock';
        } else if (lowerHeader === 'min' || lowerHeader === 'min threshold' || lowerHeader === 'minimum') {
          autoMapping[header] = 'minThreshold';
        } else if (lowerHeader === 'max' || lowerHeader === 'max threshold' || lowerHeader === 'maximum') {
          autoMapping[header] = 'maxThreshold';
        } else if (lowerHeader === 'unit' || lowerHeader === 'order unit') {
          autoMapping[header] = 'unit';
        } else if (lowerHeader === 'critical') {
          autoMapping[header] = 'critical';
        } else if (lowerHeader === 'controlled') {
          autoMapping[header] = 'controlled';
        } else if (lowerHeader === 'pack size' || lowerHeader === 'packsize') {
          autoMapping[header] = 'packSize';
        } else if (lowerHeader === 'barcode' || lowerHeader === 'sku') {
          autoMapping[header] = 'barcode';
        } else if (lowerHeader === 'pharmacode') {
          autoMapping[header] = 'pharmacode';
        } else if (lowerHeader === 'gtin' || lowerHeader === 'ean' || lowerHeader === 'gtin/ean') {
          autoMapping[header] = 'gtin';
        } else if (lowerHeader === 'manufacturer' || lowerHeader === 'hersteller') {
          autoMapping[header] = 'manufacturer';
        } else if (lowerHeader === 'supplierprice' || lowerHeader === 'supplier price' || lowerHeader === 'price' || lowerHeader === 'basispreis') {
          autoMapping[header] = 'supplierPrice';
        } else if (lowerHeader === 'preferredsupplier' || lowerHeader === 'preferred supplier' || lowerHeader === 'supplier' || lowerHeader === 'lieferant') {
          autoMapping[header] = 'preferredSupplier';
        } else if (lowerHeader === 'patientprice' || lowerHeader === 'patient price' || lowerHeader === 'final price' || lowerHeader === 'endpreis' || lowerHeader === 'abgabepreis') {
          autoMapping[header] = 'patientPrice';
        }
      });
      setCsvMapping(autoMapping);
    } catch (error: any) {
      toast({
        title: "Excel Parse Error",
        description: error.message || "Failed to parse Excel file",
        variant: "destructive",
      });
    }
  };
  
  const processCsvData = () => {
    // Validate that name is mapped
    const nameColumn = Object.entries(csvMapping).find(([_, target]) => target === 'name')?.[0];
    if (!nameColumn) {
      toast({
        title: "Missing Required Field",
        description: "Please map a column to 'Name' - this field is required",
        variant: "destructive",
      });
      return;
    }
    
    const items: any[] = [];
    csvData.forEach((row, index) => {
      const item: any = {
        name: '',
        description: '',
        unit: 'Pack',
        packSize: 1,
        minThreshold: 5,
        maxThreshold: 20,
        initialStock: 0,
        critical: false,
        controlled: false,
      };
      
      // Temporary storage for ampule data
      let ampuleQuantity = '';
      let ampuleUnit = '';
      
      Object.entries(csvMapping).forEach(([csvCol, targetField]) => {
        const value = row[csvCol];
        if (!value && targetField === 'name') return; // Skip rows without name
        
        switch (targetField) {
          case 'name':
            item.name = String(value || '');
            break;
          case 'description':
            item[targetField] = String(value || '');
            break;
          case 'unit':
            item[targetField] = value === 'Single unit' ? 'Single unit' : 'Pack';
            break;
          case 'initialStock':
          case 'minThreshold':
          case 'maxThreshold':
          case 'packSize':
            item[targetField] = parseInt(value) || 0;
            break;
          case 'critical':
          case 'controlled':
            const boolVal = String(value).toLowerCase();
            item[targetField] = boolVal === 'true' || boolVal === 'yes' || boolVal === '1';
            break;
          // Medication fields
          case 'medicationGroup':
          case 'administrationRoute':
          case 'defaultDose':
          case 'administrationUnit':
          case 'rateUnit':
            item[targetField] = value ? String(value) : undefined;
            break;
          case 'ampuleQuantity':
            ampuleQuantity = value ? String(value) : '';
            break;
          case 'ampuleUnit':
            ampuleUnit = value ? String(value) : '';
            break;
          // Catalog export fields
          case 'barcode':
          case 'folderPath':
          case 'vendorName':
            item[targetField] = value ? String(value) : undefined;
            break;
          case 'currentUnits':
          case 'reorderPoint':
          case 'minUnits':
          case 'maxUnits':
            // Only set if value exists and is a valid number
            const numVal = value ? parseInt(value) : undefined;
            if (numVal !== undefined && !isNaN(numVal)) {
              item[targetField] = numVal;
            }
            break;
          case 'trackExactQuantity':
            const trackVal = String(value).toLowerCase();
            item[targetField] = trackVal === 'true' || trackVal === 'yes' || trackVal === '1';
            break;
          // Image URL
          case 'imageUrl':
            item.imageUrl = value ? String(value) : undefined;
            break;
          // Barcodes (semicolon-separated)
          case 'barcodes':
            if (value) {
              item.barcodes = String(value).split(';').map(b => b.trim()).filter(b => b);
            }
            break;
          // Item codes for catalog transfer
          case 'gtin':
          case 'pharmacode':
          case 'swissmedicNr':
          case 'migel':
          case 'atc':
          case 'manufacturer':
          case 'manufacturerRef':
          case 'packContent':
          case 'contentPerUnit':
          case 'abgabekategorie':
            if (!item.itemCodes) item.itemCodes = {};
            item.itemCodes[targetField] = value ? String(value) : undefined;
            break;
          case 'unitsPerPack':
            if (!item.itemCodes) item.itemCodes = {};
            const upVal = value ? parseInt(value) : undefined;
            if (upVal !== undefined && !isNaN(upVal)) {
              item.itemCodes.unitsPerPack = upVal;
            }
            break;
          // Supplier fields
          case 'preferredSupplier':
          case 'supplierArticleCode':
            if (!item.supplierInfo) item.supplierInfo = {};
            item.supplierInfo[targetField] = value ? String(value) : undefined;
            break;
          case 'supplierPrice':
            if (!item.supplierInfo) item.supplierInfo = {};
            // Parse currency-formatted values like "CHF 12,34" or "€ 45,67"
            item.supplierInfo[targetField] = parseCurrencyValue(value);
            break;
          // Patient price (final dispensing price)
          case 'patientPrice':
            // Parse currency-formatted values like "CHF 12,34" or "€ 45,67"
            item.patientPrice = parseCurrencyValue(value);
            break;
        }
      });
      
      // Combine ampule quantity and unit into ampuleTotalContent
      if (ampuleQuantity && ampuleUnit) {
        item.ampuleTotalContent = `${ampuleQuantity} ${ampuleUnit}`;
      } else if (ampuleQuantity) {
        item.ampuleTotalContent = ampuleQuantity;
      }
      
      if (item.name) {
        items.push(item);
      }
    });
    
    if (items.length === 0) {
      toast({
        title: "No Valid Items",
        description: "No valid items found in CSV. Make sure the Name column is mapped and contains data.",
        variant: "destructive",
      });
      return;
    }
    
    setBulkItems(items);
    setImportMode('select'); // Move to review screen
  };
  
  const downloadSimpleCsvTemplate = () => {
    const template = [
      ['Name', 'Description', 'Unit', 'Pack Size', 'Initial Stock', 'Min Threshold', 'Max Threshold', 'Critical', 'Controlled'],
      ['Bandages 5cm', 'Sterile gauze bandages', 'pack', '10', '50', '10', '30', 'false', 'false'],
      ['Sodium Chloride 0.9%', '1000ml bag IV solution', 'pack', '12', '100', '20', '50', 'false', 'false'],
      ['Syringes 10ml', 'Disposable syringes', 'pack', '100', '200', '50', '150', 'false', 'false'],
    ];
    
    const csvContent = template.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'items_simple_template.csv';
    link.click();
  };

  const downloadMedicationCsvTemplate = () => {
    const template = [
      ['Name', 'Description', 'Unit', 'Pack Size', 'Initial Stock', 'Min Threshold', 'Max Threshold', 'Critical', 'Controlled', 'Group', 'Route', 'DefaultDose', 'AmpouleQuantity', 'AmpouleUnit', 'AdministrationUnit', 'IsRateControlled', 'RateUnit'],
      ['Midazolam (Dormicum) 5mg', 'Benzodiazepine sedative', 'pack', '10', '20', '5', '15', 'false', 'true', 'Hypnotika', 'i.v.', '2', '5', 'mg', 'mg', 'false', ''],
      ['Propofol 200mg/20ml', 'Anesthetic agent 10mg/ml', 'pack', '10', '30', '10', '25', 'true', 'true', 'Hypnotika', 'i.v.', '100', '20', 'ml', 'mg', 'true', 'mg/h'],
      ['Fentanyl 0.5mg', 'Opioid analgesic', 'pack', '10', '25', '8', '20', 'true', 'true', 'Opioide', 'i.v.', '0.1', '0.5', 'mg', 'µg', 'true', 'µg/h'],
    ];
    
    const csvContent = template.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'medications_template.csv';
    link.click();
  };

  const downloadItemsCatalog = async () => {
    if (!activeHospital?.id || !activeHospital?.name || items.length === 0) {
      toast({
        title: "No Data",
        description: "No items available to export",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Exporting...",
        description: "Fetching complete item data with codes",
      });

      const response = await fetch(`/api/items/${activeHospital.id}/export-catalog?unitId=${activeHospital.unitId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch catalog data");
      }
      const itemsWithCodes = await response.json();

      const folderMap = new Map<string, Folder>();
      folders.forEach(folder => folderMap.set(folder.id, folder));

      const vendorMap = new Map<string, string>();
      vendors.forEach(vendor => vendorMap.set(vendor.id, vendor.name));

      const headers = [
        'Name',
        'Description',
        'Unit',
        'PackSize',
        'MinThreshold',
        'MaxThreshold',
        'DefaultOrderQty',
        'TrackExactQuantity',
        'Critical',
        'Controlled',
        'CurrentUnits',
        'FolderName',
        'VendorName',
        'ImageUrl',
        'Barcodes',
        'GTIN',
        'Pharmacode',
        'SwissmedicNr',
        'MiGeL',
        'ATC',
        'Manufacturer',
        'ManufacturerRef',
        'PackContent',
        'UnitsPerPack',
        'ContentPerUnit',
        'Abgabekategorie',
        'PreferredSupplier',
        'SupplierArticleCode',
        'SupplierPrice'
      ];

      const rows = itemsWithCodes.map((item: any) => {
        const folderName = item.folderId ? (folderMap.get(item.folderId)?.name || '') : '';
        const vendorName = item.vendorId ? (vendorMap.get(item.vendorId) || '') : '';
        const codes = item.codes || {};
        const preferredSupplier = item.suppliers?.find((s: any) => s.isPreferred) || item.suppliers?.[0] || {};
        
        return [
          item.name || '',
          item.description || '',
          item.unit || 'Pack',
          item.packSize || 1,
          item.minThreshold || 0,
          item.maxThreshold || 0,
          item.defaultOrderQty || 0,
          item.trackExactQuantity ? 'true' : 'false',
          item.critical ? 'true' : 'false',
          item.controlled ? 'true' : 'false',
          item.currentUnits || 0,
          folderName,
          vendorName,
          item.imageUrl || '',
          (item.barcodes || []).join(';'),
          codes.gtin || '',
          codes.pharmacode || '',
          codes.swissmedicNr || '',
          codes.migel || '',
          codes.atc || '',
          codes.manufacturer || '',
          codes.manufacturerRef || '',
          codes.packContent || '',
          codes.unitsPerPack || '',
          codes.contentPerUnit || '',
          codes.abgabekategorie || '',
          preferredSupplier.supplierName || '',
          preferredSupplier.articleCode || '',
          preferredSupplier.basispreis || preferredSupplier.publikumspreis || ''
        ];
      });

      const csvData = [headers, ...rows];
      
      const csvContent = csvData.map(row => 
        row.map((cell: string | number) => {
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n') || cellStr.includes(';')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `items_catalog_${activeHospital.name}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      toast({
        title: "Export Complete",
        description: `Exported ${itemsWithCodes.length} items with codes successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export items",
        variant: "destructive",
      });
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
    
    // Add folderId to each item if selected (for photo imports)
    // Preserve folderPath from CSV imports
    const itemsWithFolder = bulkItems.map(item => 
      bulkImportFolderId 
        ? { ...item, folderId: bulkImportFolderId }
        : item
    );
    
    bulkCreateMutation.mutate(itemsWithFolder);
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

    // Filter by archived status based on active filter
    if (activeFilter === "archived") {
      // Show only archived items
      filtered = filtered.filter(item => item.status === 'archived');
    } else {
      // Hide archived items for all other filters
      filtered = filtered.filter(item => item.status !== 'archived');
    }

    // Apply search filter (name, description, pharmacode, GTIN)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item => {
        // Search by name or description
        if (item.name.toLowerCase().includes(searchLower) ||
            item.description?.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Search by pharmacode or GTIN
        const codes = itemCodesMap.get(item.id);
        if (codes) {
          if (codes.pharmacode?.toLowerCase().includes(searchLower) ||
              codes.gtin?.toLowerCase().includes(searchLower)) {
            return true;
          }
        }
        return false;
      });
    }

    // Apply category filter (threshold-based) - skip for archived filter
    if (activeFilter !== "all" && activeFilter !== "archived") {
      filtered = filtered.filter(item => {
        const currentQty = item.stockLevel?.qtyOnHand || 0;
        const minThreshold = item.minThreshold || 0;
        switch (activeFilter) {
          case "runningLow":
            // Running low: stock > 0 but at or below min threshold
            return currentQty > 0 && currentQty <= minThreshold;
          case "stockout":
            // Stockout: zero stock
            return currentQty === 0;
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
  }, [items, folders, searchTerm, activeFilter, sortBy, itemCodesMap, runwayMap]);

  const filteredItems = useMemo(() => {
    return [...organizedItems.rootItems, ...organizedItems.folderGroups.flatMap(g => g.items)];
  }, [organizedItems]);

  // Auto-expand folders containing search results or filtered items
  useEffect(() => {
    if (searchTerm || activeFilter !== "all") {
      // When searching or filtering, expand all folders that have matching items
      const foldersWithResults = organizedItems.folderGroups
        .filter(group => group.items.length > 0)
        .map(group => group.folder.id);
      
      setExpandedFolders(new Set(foldersWithResults));
    }
  }, [searchTerm, activeFilter, organizedItems.folderGroups]);

  const getFilterCounts = () => {
    // Only count active items (not archived) for normal filters
    const activeItems = items.filter(item => item.status !== 'archived');
    const archivedItems = items.filter(item => item.status === 'archived');
    return {
      all: activeItems.length,
      // Running low: stock > 0 but at or below min threshold
      runningLow: activeItems.filter(item => {
        const currentQty = item.stockLevel?.qtyOnHand || 0;
        const minThreshold = item.minThreshold || 0;
        return currentQty > 0 && currentQty <= minThreshold;
      }).length,
      // Stockout: zero stock
      stockout: activeItems.filter(item => {
        const currentQty = item.stockLevel?.qtyOnHand || 0;
        return currentQty === 0;
      }).length,
      // Archived items count
      archived: archivedItems.length,
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
    
    // Red for stockout (zero stock)
    if (currentQty === 0) {
      return { color: "text-red-500", status: t('items.outOfStock') };
    }
    // Yellow for running low (below or at min threshold)
    if (currentQty <= minThreshold) {
      return { color: "text-yellow-500", status: t('items.belowMin') };
    }
    // Green for enough stock
    return { color: "text-green-500", status: t('items.good') };
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
      {/* Import Job Notification */}
      {importJob && (
        <div 
          className={`p-3 flex items-center gap-3 border-b cursor-pointer transition-colors ${
            importJob.status === 'processing' 
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/50' 
              : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/50'
          }`}
          onClick={handleImportNotificationClick}
          data-testid="import-notification"
        >
          {importJob.status === 'processing' ? (
            <>
              <i className="fas fa-spinner fa-spin text-blue-600 dark:text-blue-400"></i>
              <div className="flex-1">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Processing images: {importJob.currentImage || 0}/{importJob.itemCount}
                  {importJob.progressPercent !== undefined && ` (${importJob.progressPercent}%)`}
                </span>
                {importJob.progressPercent !== undefined && (
                  <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300" 
                      style={{ width: `${importJob.progressPercent}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <i className="fas fa-check-circle text-green-600 dark:text-green-400"></i>
              <span className="text-sm font-medium text-green-900 dark:text-green-100">
                Import complete - {importJob.itemCount} items extracted. Click to review.
              </span>
            </>
          )}
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-foreground">{t('items.title')}</h1>
          <div className="flex gap-2 flex-wrap">
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
            ) : isBulkDeleteMode ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setIsBulkDeleteMode(false); setSelectedItems(new Set()); }} data-testid="cancel-bulk-delete" className="flex-1 sm:flex-initial">
                  {t('common.cancel')}
                </Button>
                {selectedItems.size > 0 && selectedItems.size < filteredItems.length && (
                  <Button variant="outline" size="sm" onClick={selectAllItems} data-testid="select-all-items" className="flex-1 sm:flex-initial">
                    <i className="fas fa-check-double mr-2"></i>
                    Select All
                  </Button>
                )}
                {selectedItems.size === filteredItems.length && filteredItems.length > 0 && (
                  <Button variant="outline" size="sm" onClick={deselectAllItems} data-testid="deselect-all-items" className="flex-1 sm:flex-initial">
                    <i className="fas fa-times mr-2"></i>
                    Deselect All
                  </Button>
                )}
                {activeHospital?.role === 'admin' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setBulkMoveDialogOpen(true)} 
                    disabled={selectedItems.size === 0 || bulkMoveMutation.isPending}
                    data-testid="move-selected-button" 
                    className="flex-1 sm:flex-initial"
                  >
                    <i className="fas fa-arrow-right-arrow-left mr-2"></i>
                    {t('items.moveToUnit', 'Move')} ({selectedItems.size})
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => bulkBillableMutation.mutate({ itemIds: Array.from(selectedItems), isBillable: true })} 
                  disabled={selectedItems.size === 0 || bulkBillableMutation.isPending}
                  data-testid="mark-billable-button" 
                  className="flex-1 sm:flex-initial"
                >
                  <i className="fas fa-file-invoice mr-2"></i>
                  {t('items.markBillable', 'Billable')} ({selectedItems.size})
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => bulkBillableMutation.mutate({ itemIds: Array.from(selectedItems), isBillable: false })} 
                  disabled={selectedItems.size === 0 || bulkBillableMutation.isPending}
                  data-testid="unmark-billable-button" 
                  className="flex-1 sm:flex-initial"
                >
                  <i className="fas fa-file-invoice-dollar mr-2"></i>
                  {t('items.unmarkBillable', 'Not Billable')} ({selectedItems.size})
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleBulkDelete} 
                  disabled={selectedItems.size === 0 || bulkDeleteMutation.isPending}
                  data-testid="delete-selected-button" 
                  className="flex-1 sm:flex-initial"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Delete ({selectedItems.size})
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadInventory}
                  disabled={items.length === 0}
                  data-testid="download-inventory-button" 
                  className="flex-1 sm:flex-initial"
                >
                  <i className="fas fa-file-pdf mr-2"></i>
                  List as PDF
                </Button>
                {canWrite && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => { setIsBulkDeleteMode(true); setSelectedItems(new Set()); }} data-testid="bulk-update-button" className="flex-1 sm:flex-initial">
                      <i className="fas fa-list-check mr-2"></i>
                      Bulk Update
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setIsBulkEditMode(true); setBulkEditItems({}); }} data-testid="bulk-edit-button" className="flex-1 sm:flex-initial">
                      <i className="fas fa-edit mr-2"></i>
                      {t('items.bulkEdit')}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setBulkImportOpen(true)} 
                      disabled={importJob?.status === 'processing'}
                      data-testid="bulk-import-button" 
                      className="flex-1 sm:flex-initial"
                    >
                      <i className="fas fa-upload mr-2"></i>
                      {t('items.bulkImport')}
                    </Button>
                    <Button size="sm" onClick={() => {
                        setDirectCameraOpen(true);
                      }} data-testid="add-item-button" className="flex-1 sm:flex-initial">
                      <i className="fas fa-plus mr-2"></i>
                      {t('items.addItem')}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setTransferDialogOpen(true);
                        setTransferItems([]);
                        setTransferTargetUnitId("");
                        setTransferSearchTerm("");
                        setTransferDirection('to');
                      }} 
                      data-testid="transfer-items-button" 
                      className="flex-1 sm:flex-initial"
                      disabled={availableDestinationUnits.length === 0}
                    >
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      {t('items.transferItems', 'Transfer Items')}
                    </Button>
                  </>
                )}
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
          className="pl-10 pr-8"
          data-testid="items-search"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
            data-testid="items-search-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
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
          className={`status-chip whitespace-nowrap ${activeFilter === "runningLow" ? "bg-yellow-500 text-white" : "chip-muted"}`}
          onClick={() => setActiveFilter("runningLow")}
          data-testid="filter-running-low"
        >
          <i className="fas fa-exclamation-triangle text-xs mr-1"></i>
          {t('items.runningLowItems', { count: filterCounts.runningLow })}
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "stockout" ? "bg-red-500 text-white" : "chip-muted"}`}
          onClick={() => setActiveFilter("stockout")}
          data-testid="filter-stockout"
        >
          <i className="fas fa-ban text-xs mr-1"></i>
          {t('items.stockoutItems', { count: filterCounts.stockout })}
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "archived" ? "bg-gray-500 text-white" : "chip-muted"}`}
          onClick={() => setActiveFilter("archived")}
          data-testid="filter-archived"
        >
          <i className="fas fa-archive text-xs mr-1"></i>
          {t('items.archivedItems', { count: filterCounts.archived })}
        </button>
      </div>

      {/* Sort Options and Create Folder */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t('items.itemsCount', { count: filteredItems.length })}</span>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateFolder}
              data-testid="create-folder-button"
            >
              <FolderPlus className="w-4 h-4 mr-1" />
              {t('items.newFolder')}
            </Button>
          )}
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
      <DndContext sensors={sensors} collisionDetection={customCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
              <p className="text-muted-foreground">{t('items.loadingItems')}</p>
            </div>
          ) : filteredItems.length === 0 && organizedItems.folderGroups.length === 0 ? (
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
                  <DraggableItem id={`folder-${folder.id}`}>
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
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <FolderIcon className="w-5 h-5 text-primary" />
                        <span className="flex-1 font-medium text-foreground">{folder.name}</span>
                        <span className="text-sm text-muted-foreground">({folderItems.length})</span>
                        {canWrite && (
                          <>
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
                          </>
                        )}
                      </div>
                    </DroppableFolder>
                  </DraggableItem>
                  {expandedFolders.has(folder.id) && (
                    <div className="pl-6 space-y-2">
                      {folderItems.map((item) => {
                        const stockStatus = getStockStatus(item);
                        const daysUntilExpiry = getDaysUntilExpiry(item.soonestExpiry);
                        const currentQty = item.stockLevel?.qtyOnHand || 0;

                        return (
                          <DraggableItem key={item.id} id={item.id} disabled={isBulkEditMode || isBulkDeleteMode || !canWrite}>
                            <div
                              className="item-row"
                              onClick={!isBulkEditMode && !isBulkDeleteMode ? () => handleEditItem(item) : undefined}
                              style={!isBulkEditMode && !isBulkDeleteMode ? { cursor: 'pointer' } : undefined}
                              data-testid={`item-${item.id}`}
                            >
                              <div className="flex items-start justify-between mb-3">
                                {isBulkDeleteMode ? (
                                  <div 
                                    className="flex items-center gap-3 flex-1 cursor-pointer -ml-2 -mr-2 pl-2 pr-2 py-1 rounded hover:bg-muted/50 transition-colors"
                                    onClick={() => toggleItemSelection(item.id)}
                                  >
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <Checkbox
                                        checked={selectedItems.has(item.id)}
                                        onCheckedChange={() => toggleItemSelection(item.id)}
                                        data-testid={`checkbox-item-${item.id}`}
                                      />
                                    </div>
                                    <div className="flex-1 pointer-events-none">
                                      <h3 className="text-sm font-semibold text-foreground truncate">{item.name}</h3>
                                      {item.description && (
                                        <p className="text-xs text-muted-foreground mt-1 truncate">{item.description}</p>
                                      )}
                                    </div>
                                  </div>
                                ) : isBulkEditMode ? (
                                  item.controlled ? (
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-2">
                                        <h3 className="text-sm font-semibold text-foreground truncate flex-1">{item.name}</h3>
                                        <span className="status-chip chip-controlled text-xs" data-testid={`item-${item.id}-controlled`}>
                                          <i className="fas fa-shield-halved"></i>
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
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
                                  )
                                ) : (
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-2">
                                      <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                                        <p className="text-sm text-muted-foreground">{item.description || ''}</p>
                                      </div>
                                      {item.controlled && (
                                        <span className="status-chip chip-controlled text-xs flex-shrink-0" data-testid={`item-${item.id}-controlled`}>
                                          <i className="fas fa-shield-halved"></i>
                                        </span>
                                      )}
                                    </div>
                                  </div>
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
                                  item.controlled ? (
                                    <div className="flex items-center gap-2 text-muted-foreground py-2" data-testid={`bulk-edit-controlled-disabled-${item.id}`}>
                                      <i className="fas fa-shield-halved text-amber-500"></i>
                                      <span className="text-sm">{t('items.controlledNoBulkEdit')}</span>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-4 gap-2 w-full">
                                      <div>
                                        <Label className="text-xs">{t('items.unitType')}</Label>
                                        <Select
                                          value={bulkEditItems[item.id]?.trackExactQuantity !== undefined 
                                            ? (bulkEditItems[item.id].trackExactQuantity ? 'pack' : 'single') 
                                            : (item.trackExactQuantity ? 'pack' : 'single')}
                                          onValueChange={(val) => {
                                            setBulkEditItems(prev => ({
                                              ...prev,
                                              [item.id]: { ...prev[item.id], trackExactQuantity: val === 'pack' }
                                            }));
                                          }}
                                        >
                                          <SelectTrigger className="h-9" data-testid={`bulk-edit-unit-type-${item.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="pack">{t('items.pack')}</SelectItem>
                                            <SelectItem value="single">{t('items.singleUnit')}</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {(bulkEditItems[item.id]?.trackExactQuantity !== undefined ? bulkEditItems[item.id].trackExactQuantity : item.trackExactQuantity) ? (
                                        <div>
                                          <Label className="text-xs">{t('items.packSize')}</Label>
                                          <Input
                                            type="number"
                                            min="1"
                                            value={bulkEditItems[item.id]?.packSize !== undefined ? bulkEditItems[item.id].packSize : (item.packSize || 1)}
                                            onChange={(e) => {
                                              const val = parseInt(e.target.value) || 1;
                                              setBulkEditItems(prev => ({
                                                ...prev,
                                                [item.id]: { ...prev[item.id], packSize: val }
                                              }));
                                            }}
                                            data-testid={`bulk-edit-pack-size-${item.id}`}
                                          />
                                        </div>
                                      ) : (
                                        <div></div>
                                      )}
                                      <div>
                                        <Label className="text-xs">
                                          {(bulkEditItems[item.id]?.trackExactQuantity !== undefined ? bulkEditItems[item.id].trackExactQuantity : item.trackExactQuantity) ? t('items.currentUnits') : t('items.stock')}
                                        </Label>
                                        <Input
                                          type="number"
                                          value={
                                            item.trackExactQuantity 
                                              ? (bulkEditItems[item.id]?.currentUnits !== undefined ? bulkEditItems[item.id].currentUnits : (item.currentUnits || 0))
                                              : (bulkEditItems[item.id]?.actualStock !== undefined ? bulkEditItems[item.id].actualStock : currentQty)
                                          }
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            if (item.trackExactQuantity) {
                                              setBulkEditItems(prev => ({
                                                ...prev,
                                                [item.id]: { ...prev[item.id], currentUnits: val }
                                              }));
                                            } else {
                                              setBulkEditItems(prev => ({
                                                ...prev,
                                                [item.id]: { ...prev[item.id], actualStock: val }
                                              }));
                                            }
                                          }}
                                          data-testid={`bulk-edit-${item.trackExactQuantity ? 'units' : 'stock'}-${item.id}`}
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
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
                                        <div>
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
                                    </div>
                                  )
                                ) : (
                                  <div className="flex items-center w-full">
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-1.5">
                                        {/* Show units directly for trackExactQuantity or single unit items, otherwise show pack qty */}
                                        {item.trackExactQuantity || item.unit.toLowerCase() === 'single unit' ? (
                                          <>
                                            <span className={`text-2xl font-bold ${stockStatus.color}`} data-testid={`item-${item.id}-stock`}>
                                              {item.trackExactQuantity ? (item.currentUnits || 0) : currentQty}
                                            </span>
                                            <i className={`fas fa-vial text-lg ${stockStatus.color}`}></i>
                                          </>
                                        ) : (
                                          <>
                                            <span className={`text-2xl font-bold ${stockStatus.color}`} data-testid={`item-${item.id}-stock`}>
                                              {currentQty}
                                            </span>
                                            <i className={`fas fa-box text-lg ${stockStatus.color}`}></i>
                                          </>
                                        )}
                                      </div>
                                      {item.status === 'archived' && (
                                        <span className="px-1.5 py-0.5 bg-gray-500 text-white rounded text-xs">{t('items.archivedBadge')}</span>
                                      )}
                                    </div>
                                    <div className="ml-auto flex gap-2 items-center">
                                      {canWrite && !item.controlled && 
                                       (item.trackExactQuantity ? (item.currentUnits || 0) > 0 : currentQty > 0) && (
                                        <button
                                          onClick={(e) => handleQuickReduce(e, item)}
                                          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 active:bg-orange-700 transition-colors flex-shrink-0 flex items-center justify-center touch-manipulation"
                                          data-testid={`item-${item.id}-quick-reduce`}
                                          title={item.trackExactQuantity || item.unit.toLowerCase() === 'single unit' ? "Reduce 1 unit" : "Reduce 1 pack"}
                                        >
                                          <i className="fas fa-arrow-right-from-bracket mr-1.5"></i>
                                          {t('items.takeOut', 'Take Out')}
                                        </button>
                                      )}
                                      {canWrite && currentQty <= (item.minThreshold || 0) && currentQty < (item.maxThreshold || Infinity) && (
                                        openOrderItems[item.id] ? (
                                          <button
                                            disabled
                                            className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium flex-shrink-0 cursor-not-allowed"
                                            data-testid={`item-${item.id}-quick-ordered`}
                                          >
                                            <i className="fas fa-check mr-1.5"></i>
                                            {t('items.quickOrdered', { count: openOrderItems[item.id].totalQty })}
                                          </button>
                                        ) : (
                                          <button
                                            onClick={(e) => handleQuickOrder(e, item)}
                                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
                                            data-testid={`item-${item.id}-quick-order`}
                                          >
                                            <i className="fas fa-bolt mr-1.5"></i>
                                            {t('items.quickOrder')}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
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
                      <DraggableItem key={item.id} id={item.id} disabled={isBulkEditMode || isBulkDeleteMode || !canWrite}>
                        <div 
                          className="item-row"
                          onClick={!isBulkEditMode && !isBulkDeleteMode ? () => handleEditItem(item) : undefined}
                          style={!isBulkEditMode && !isBulkDeleteMode ? { cursor: 'pointer' } : undefined}
                          data-testid={`item-${item.id}`}
                        >
                <div className="flex items-start justify-between mb-3">
                  {isBulkDeleteMode ? (
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer -ml-2 -mr-2 pl-2 pr-2 py-1 rounded hover:bg-muted/50 transition-colors"
                      onClick={() => toggleItemSelection(item.id)}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleItemSelection(item.id)}
                          data-testid={`checkbox-item-${item.id}`}
                        />
                      </div>
                      <div className="flex-1 pointer-events-none">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        <p className="text-sm text-muted-foreground">{item.description || ''}</p>
                      </div>
                    </div>
                  ) : isBulkEditMode ? (
                    item.controlled ? (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold text-foreground truncate flex-1">{item.name}</h3>
                          <span className="status-chip chip-controlled text-xs">
                            <i className="fas fa-shield-halved"></i>
                          </span>
                        </div>
                      </div>
                    ) : (
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
                    )
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground">{item.name}</h3>
                          <p className="text-sm text-muted-foreground">{item.description || ''}</p>
                        </div>
                        {item.controlled && (
                          <span className="status-chip chip-controlled text-xs flex-shrink-0" data-testid={`item-${item.id}-controlled`}>
                            <i className="fas fa-shield-halved"></i>
                          </span>
                        )}
                      </div>
                    </div>
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
                    item.controlled ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-2" data-testid={`bulk-edit-controlled-disabled-${item.id}`}>
                        <i className="fas fa-shield-halved text-amber-500"></i>
                        <span className="text-sm">{t('items.controlledNoBulkEdit')}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 w-full">
                        <div>
                          <Label className="text-xs">{t('items.unitType')}</Label>
                          <Select
                            value={bulkEditItems[item.id]?.trackExactQuantity !== undefined 
                              ? (bulkEditItems[item.id].trackExactQuantity ? 'pack' : 'single') 
                              : (item.trackExactQuantity ? 'pack' : 'single')}
                            onValueChange={(val) => {
                              setBulkEditItems(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], trackExactQuantity: val === 'pack' }
                              }));
                            }}
                          >
                            <SelectTrigger className="h-9" data-testid={`bulk-edit-unit-type-desktop-${item.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pack">{t('items.pack')}</SelectItem>
                              <SelectItem value="single">{t('items.singleUnit')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(bulkEditItems[item.id]?.trackExactQuantity !== undefined ? bulkEditItems[item.id].trackExactQuantity : item.trackExactQuantity) ? (
                          <div>
                            <Label className="text-xs">{t('items.packSize')}</Label>
                            <Input
                              type="number"
                              min="1"
                              value={bulkEditItems[item.id]?.packSize !== undefined ? bulkEditItems[item.id].packSize : (item.packSize || 1)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                setBulkEditItems(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], packSize: val }
                                }));
                              }}
                              data-testid={`bulk-edit-pack-size-${item.id}`}
                            />
                          </div>
                        ) : (
                          <div></div>
                        )}
                        <div>
                          <Label className="text-xs">
                            {(bulkEditItems[item.id]?.trackExactQuantity !== undefined ? bulkEditItems[item.id].trackExactQuantity : item.trackExactQuantity) ? t('items.currentUnits') : t('items.stock')}
                          </Label>
                          <Input
                            type="number"
                            value={
                              item.trackExactQuantity 
                                ? (bulkEditItems[item.id]?.currentUnits !== undefined ? bulkEditItems[item.id].currentUnits : (item.currentUnits || 0))
                                : (bulkEditItems[item.id]?.actualStock !== undefined ? bulkEditItems[item.id].actualStock : currentQty)
                            }
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              if (item.trackExactQuantity) {
                                setBulkEditItems(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], currentUnits: val }
                                }));
                              } else {
                                setBulkEditItems(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], actualStock: val }
                                }));
                              }
                            }}
                            data-testid={`bulk-edit-${item.trackExactQuantity ? 'units' : 'stock'}-${item.id}`}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">{t('items.minThreshold')}</Label>
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
                          <div>
                            <Label className="text-xs">{t('items.maxThreshold')}</Label>
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
                      </div>
                    )
                  ) : (
                    <div className="flex items-center w-full">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          {/* Show units directly for trackExactQuantity or single unit items, otherwise show pack qty */}
                          {item.trackExactQuantity || item.unit.toLowerCase() === 'single unit' ? (
                            <>
                              <span className={`text-2xl font-bold ${stockStatus.color}`} data-testid={`item-${item.id}-stock`}>
                                {item.trackExactQuantity ? (item.currentUnits || 0) : currentQty}
                              </span>
                              <i className={`fas fa-vial text-lg ${stockStatus.color}`}></i>
                            </>
                          ) : (
                            <>
                              <span className={`text-2xl font-bold ${stockStatus.color}`} data-testid={`item-${item.id}-stock`}>
                                {currentQty}
                              </span>
                              <i className={`fas fa-box text-lg ${stockStatus.color}`}></i>
                            </>
                          )}
                        </div>
                        {item.status === 'archived' && (
                          <span className="px-1.5 py-0.5 bg-gray-500 text-white rounded text-xs">{t('items.archivedBadge')}</span>
                        )}
                      </div>
                      <div className="ml-auto flex gap-2 items-center">
                        {canWrite && !item.controlled && 
                         (item.trackExactQuantity ? (item.currentUnits || 0) > 0 : currentQty > 0) && (
                          <button
                            onClick={(e) => handleQuickReduce(e, item)}
                            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 active:bg-orange-700 transition-colors flex-shrink-0 flex items-center justify-center touch-manipulation"
                            data-testid={`item-${item.id}-quick-reduce`}
                            title={item.trackExactQuantity || item.unit.toLowerCase() === 'single unit' ? "Reduce 1 unit" : "Reduce 1 pack"}
                          >
                            <i className="fas fa-arrow-right-from-bracket mr-1.5"></i>
                            {t('items.takeOut', 'Take Out')}
                          </button>
                        )}
                        {canWrite && currentQty <= (item.minThreshold || 0) && currentQty < (item.maxThreshold || Infinity) && (
                          openOrderItems[item.id] ? (
                            <button
                              disabled
                              className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium flex-shrink-0 cursor-not-allowed"
                              data-testid={`item-${item.id}-quick-ordered`}
                            >
                              <i className="fas fa-check mr-1.5"></i>
                              {t('items.quickOrdered', { count: openOrderItems[item.id].totalQty })}
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleQuickOrder(e, item)}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
                              data-testid={`item-${item.id}-quick-order`}
                            >
                              <i className="fas fa-bolt mr-1.5"></i>
                              {t('items.quickOrder')}
                            </button>
                          )
                        )}
                      </div>
                    </div>
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
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }} modal={!webcamCaptureOpen}>
        <DialogContent 
          className="max-w-md max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => { if (webcamCaptureOpen) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (webcamCaptureOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{t('items.addNewItem')}</DialogTitle>
            <DialogDescription>{t('items.createNewInventoryItem')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            {/* Step 1: Barcode/Codes Photo (Primary) - Only show in step1 stage */}
            {addItemStage === 'step1' && (
            <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-primary text-primary-foreground">
                    1
                  </div>
                  <Label className="font-semibold">{t('items.step1ScanBarcode')}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('items.step1BarcodeDescription')}</p>
              <input
                type="file"
                ref={codesFileInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleCodesImageUpload}
                className="hidden"
              />
              <input
                type="file"
                ref={codesGalleryInputRef}
                accept="image/*"
                onChange={handleCodesImageUpload}
                className="hidden"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="h-14"
                  onClick={() => codesFileInputRef.current?.click()}
                  disabled={isAnalyzingCodes || isLookingUpGalexis}
                  data-testid="button-scan-barcode"
                >
                  <i className={`fas ${isAnalyzingCodes || isLookingUpGalexis ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2 text-lg`}></i>
                  <div className="text-left">
                    <div className="font-semibold">
                      {isAnalyzingCodes ? t('items.analyzing') : isLookingUpGalexis ? t('items.lookingUp') : t('controlled.takePhoto')}
                    </div>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14"
                  onClick={() => codesGalleryInputRef.current?.click()}
                  disabled={isAnalyzingCodes || isLookingUpGalexis}
                  data-testid="button-gallery-codes"
                >
                  <i className="fas fa-images mr-2 text-lg"></i>
                  <div className="text-left">
                    <div className="font-semibold">{t('items.uploadFromGallery')}</div>
                  </div>
                </Button>
              </div>
              {codesImage && (
                <div className="mt-2">
                  <img src={codesImage} alt="Barcode" className="h-16 w-16 object-cover rounded border" />
                </div>
              )}
              
              {/* Product Lookup Result */}
              {galexisLookupResult && (
                <div className={`mt-3 p-3 rounded-lg ${galexisLookupResult.found ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
                  {galexisLookupResult.found ? (
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <i className="fas fa-check-circle"></i>
                      <span className="text-sm font-medium">
                        {galexisLookupResult.source === 'hin' ? t('items.productFoundViaHin') : t('items.productFoundViaGalexis')}
                      </span>
                    </div>
                  ) : (
                    <div className="text-amber-700 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span className="text-sm font-medium">{t('items.productNotFound')}</span>
                      </div>
                      <p className="text-xs mt-1">{galexisLookupResult.message}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Extracted Codes Display */}
              {(codesImage || formData.gtin || formData.pharmacode) && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-barcode text-primary"></i>
                    <span className="text-sm font-medium">{t('items.extractedCodes')}</span>
                  </div>
                  
                  {/* GTIN */}
                  <div className="flex items-center gap-2">
                    <Label className="w-24 text-xs text-muted-foreground">GTIN/EAN</Label>
                    <Input 
                      value={formData.gtin}
                      onChange={(e) => setFormData(prev => ({ ...prev, gtin: e.target.value }))}
                      placeholder="GTIN..."
                      className="h-8 flex-1"
                      data-testid="input-add-gtin"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setScanningCodeField('gtin')}
                      data-testid="button-scan-gtin"
                    >
                      <i className="fas fa-barcode"></i>
                    </Button>
                    {formData.gtin && !galexisLookupResult?.found && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => lookupGalexisProduct(formData.gtin)}
                        disabled={isLookingUpGalexis}
                        data-testid="button-lookup-galexis"
                      >
                        <i className={`fas ${isLookingUpGalexis ? 'fa-spinner fa-spin' : 'fa-search'} mr-1`}></i>
                        {t('items.lookup')}
                      </Button>
                    )}
                  </div>
                  
                  {/* Pharmacode */}
                  <div className="flex items-center gap-2">
                    <Label className="w-24 text-xs text-muted-foreground">Pharmacode</Label>
                    <Input 
                      value={formData.pharmacode}
                      onChange={(e) => setFormData(prev => ({ ...prev, pharmacode: e.target.value }))}
                      placeholder="Pharmacode..."
                      className="h-8 flex-1"
                      data-testid="input-add-pharmacode"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setScanningCodeField('pharmacode')}
                      data-testid="button-scan-pharmacode"
                    >
                      <i className="fas fa-barcode"></i>
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Skip to Step 2 button */}
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full mt-4 text-muted-foreground"
                onClick={() => setAddItemStage('step2')}
              >
                <i className="fas fa-forward mr-2"></i>
                {t('items.skipPhotoEntry')}
              </Button>
            </div>
            )}
            
            {/* Step 2: Product Photo (Fallback) - Only show in step2 stage */}
            {addItemStage === 'step2' && (
              <div className="p-4 rounded-lg border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                  <Label className="font-semibold">{t('items.step2ProductPhoto')}</Label>
                  <span className="text-xs text-muted-foreground">({t('common.optional')})</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{t('items.step2FallbackDescription')}</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <input
                  type="file"
                  ref={galleryInputRef}
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleTakePhoto('product')}
                    disabled={isAnalyzing}
                    data-testid="button-camera-image"
                  >
                    <i className={`fas ${isAnalyzing ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                    {isAnalyzing ? t('items.analyzing') : t('controlled.takePhoto')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isAnalyzing}
                    data-testid="button-gallery-image"
                  >
                    <i className="fas fa-images mr-2"></i>
                    {t('items.uploadFromGallery')}
                  </Button>
                </div>
                {uploadedImages.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {uploadedImages.map((img, idx) => (
                      <img key={idx} src={img} alt={`Upload ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                    ))}
                  </div>
                )}
                
                {/* Skip to manual entry button */}
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full mt-4 text-muted-foreground"
                  onClick={() => setAddItemStage('manual')}
                >
                  <i className="fas fa-forward mr-2"></i>
                  {t('items.skipToManualEntry')}
                </Button>
              </div>
            )}

            {/* Manual Form Fields - Only show in manual stage */}
            {addItemStage === 'manual' && (
            <>
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

            {/* Item Qualities - Controlled */}
            <div className="flex gap-4">
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

            {/* Order Unit Selector */}
            <div>
              <Label>{t('items.placeOrdersBy')} *</Label>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUnit("Pack")}
                  className={`flex-1 py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "Pack" 
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
                  onClick={() => setSelectedUnit("Single unit")}
                  className={`flex-1 py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "Single unit" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  }`}
                  data-testid="unit-single"
                >
                  <i className="fas fa-vial text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.singleUnit')}</div>
                </button>
              </div>
            </div>

            {/* Track Exact Quantity - Only for Pack orders */}
            {selectedUnit === "Pack" && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="trackExactQuantity" 
                    name="trackExactQuantity"
                    checked={formData.trackExactQuantity}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, trackExactQuantity: checked === true }))}
                    data-testid="checkbox-track-exact-quantity"
                    disabled={formData.controlled}
                  />
                  <Label htmlFor="trackExactQuantity" className={formData.controlled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}>{t('items.trackExactQuantity')}</Label>
                </div>
                {formData.controlled && (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    <i className="fas fa-info-circle mr-1"></i>
                    Required for controlled packed items
                  </p>
                )}
              </div>
            )}

            {/* Pack Size and Current Units - Only shown when Track Exact Quantity is checked */}
            {selectedUnit === "Pack" && formData.trackExactQuantity && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-900/50 space-y-4">
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
                    onFocus={handleNumberInputFocus}
                    data-testid="input-item-pack-size" 
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.packSizeHelp')}</p>
                </div>
                <div>
                  <Label htmlFor="currentUnits">{t('items.currentUnits')} *</Label>
                  <Input 
                    ref={currentUnitsInputRef}
                    id="currentUnits" 
                    name="currentUnits" 
                    type="number" 
                    min="0"
                    value={formData.currentUnits}
                    onChange={(e) => setFormData(prev => ({ ...prev, currentUnits: e.target.value }))}
                    onFocus={handleNumberInputFocus}
                    data-testid="input-item-current-units" 
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.currentUnitsHelp')}</p>
                </div>
              </div>
            )}

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
              <Label htmlFor="initialStock" className="text-base font-semibold">
                {t('items.actualStock')}
                {formData.trackExactQuantity && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">(Auto-calculated)</span>
                )}
              </Label>
              <Input 
                ref={initialStockInputRef}
                id="initialStock" 
                name="initialStock" 
                type="number" 
                min="0"
                value={formData.initialStock}
                onChange={(e) => setFormData(prev => ({ ...prev, initialStock: e.target.value }))}
                onFocus={handleNumberInputFocus}
                data-testid="input-initial-stock"
                className="mt-2 text-lg font-medium"
                disabled={formData.trackExactQuantity}
                readOnly={formData.trackExactQuantity}
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
                  onFocus={handleNumberInputFocus}
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
                  onFocus={handleNumberInputFocus}
                  data-testid="input-item-max" 
                />
              </div>
            </div>

            {/* Extracted Codes Section - Collapsible */}
            {(formData.gtin || formData.pharmacode || formData.manufacturer || formData.lotNumber) && (
              <Accordion type="single" collapsible defaultValue="codes" className="border rounded-lg">
                <AccordionItem value="codes" className="border-0">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-barcode text-primary"></i>
                      <span className="font-medium">Extracted Product Codes</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-3">
                      {formData.gtin && (
                        <div>
                          <Label htmlFor="add-gtin" className="text-xs text-muted-foreground">GTIN/EAN</Label>
                          <Input 
                            id="add-gtin"
                            value={formData.gtin}
                            onChange={(e) => setFormData(prev => ({ ...prev, gtin: e.target.value }))}
                            data-testid="input-add-gtin"
                            className="h-8"
                          />
                        </div>
                      )}
                      {formData.pharmacode && (
                        <div>
                          <Label htmlFor="add-pharmacode" className="text-xs text-muted-foreground">Pharmacode</Label>
                          <Input 
                            id="add-pharmacode"
                            value={formData.pharmacode}
                            onChange={(e) => setFormData(prev => ({ ...prev, pharmacode: e.target.value }))}
                            data-testid="input-add-pharmacode"
                            className="h-8"
                          />
                        </div>
                      )}
                      {formData.manufacturer && (
                        <div>
                          <Label htmlFor="add-manufacturer" className="text-xs text-muted-foreground">Manufacturer</Label>
                          <Input 
                            id="add-manufacturer"
                            value={formData.manufacturer}
                            onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
                            data-testid="input-add-manufacturer"
                            className="h-8"
                          />
                        </div>
                      )}
                      {(formData.lotNumber || formData.expiryDate) && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2 mb-2">
                            <i className="fas fa-boxes text-xs text-muted-foreground"></i>
                            <span className="text-xs font-medium text-muted-foreground">Lot Information</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label htmlFor="add-lot" className="text-xs text-muted-foreground">Lot Number</Label>
                              <Input 
                                id="add-lot"
                                value={formData.lotNumber}
                                onChange={(e) => setFormData(prev => ({ ...prev, lotNumber: e.target.value }))}
                                data-testid="input-add-lot"
                                className="h-8 font-mono"
                              />
                            </div>
                            <div>
                              <Label htmlFor="add-expiry" className="text-xs text-muted-foreground">Expiry Date</Label>
                              <FlexibleDateInput 
                                id="add-expiry"
                                value={formData.expiryDate}
                                onChange={(value) => setFormData(prev => ({ ...prev, expiryDate: value }))}
                                data-testid="input-add-expiry"
                                className="h-8"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="flex gap-3 pt-4 justify-end">
              <Button type="button" variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
                {t('common.cancel')}
              </Button>
              <Button 
                type="submit" 
                variant="secondary"
                disabled={createItemMutation.isPending || isAnalyzing} 
                data-testid="button-save-item"
                onClick={() => setSaveAndCloseAdd(false)}
              >
                {createItemMutation.isPending && !saveAndCloseAdd ? t('common.loading') : t('common.save')}
              </Button>
              <Button 
                type="submit" 
                disabled={createItemMutation.isPending || isAnalyzing} 
                data-testid="button-save-close-item"
                onClick={() => setSaveAndCloseAdd(true)}
              >
                {createItemMutation.isPending && saveAndCloseAdd ? t('common.loading') : t('items.saveAndClose', 'Save & Close')}
              </Button>
            </div>
            </>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) handleCloseEditDialog(); else setEditDialogOpen(true); }} modal={!webcamCaptureOpen}>
        <DialogContent 
          className="max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden outline-none"
          onInteractOutside={(e) => { if (webcamCaptureOpen) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (webcamCaptureOpen) e.preventDefault(); }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Fixed Header */}
          <div className="flex-shrink-0 bg-background z-10 px-6 pt-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>{t('items.editItem')}</DialogTitle>
              <DialogDescription>{editFormData.name || t('items.updateItemDetails')}</DialogDescription>
            </DialogHeader>
            <Tabs value={editDialogTab} onValueChange={setEditDialogTab} className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details" data-testid="tab-item-details">{t('items.itemDetails')}</TabsTrigger>
                <TabsTrigger value="codes" data-testid="tab-item-codes">Codes</TabsTrigger>
                <TabsTrigger value="invoicing" data-testid="tab-item-invoicing">{t('items.invoicing', 'Invoicing')}</TabsTrigger>
                <TabsTrigger value="photo" data-testid="tab-item-photo">{t('items.itemPhoto')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Scrollable Content */}
          <form onSubmit={handleUpdateItem} className="flex-1 overflow-y-auto px-6 pt-2 pb-4 min-h-0 outline-none focus:outline-none">
            <Tabs value={editDialogTab} className="w-full">
              <TabsContent value="details" className="space-y-4 mt-0">
                {!canWrite && (
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                    <i className="fas fa-eye mr-2"></i>
                    {t('common.viewOnly')}
                  </div>
                )}
                <div>
              <Label htmlFor="edit-name">{t('items.itemName')} *</Label>
              <Input 
                id="edit-name" 
                name="name" 
                value={editFormData.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                disabled={!canWrite}
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
                disabled={!canWrite}
                data-testid="input-edit-description" 
              />
            </div>

            {/* Item Qualities - Controlled and Archived */}
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-controlled" 
                  name="controlled"
                  checked={editFormData.controlled}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, controlled: checked === true }))}
                  disabled={!canWrite}
                  data-testid="checkbox-edit-controlled" 
                />
                <Label htmlFor="edit-controlled" className={!canWrite ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}>{t('items.controlled')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-archived" 
                  name="archived"
                  checked={editFormData.status === 'archived'}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, status: checked ? 'archived' : 'active' }))}
                  disabled={!canWrite}
                  data-testid="checkbox-edit-archived" 
                />
                <Label htmlFor="edit-archived" className={!canWrite ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}>{t('items.archiveItem')}</Label>
              </div>
            </div>

            {/* Order Unit Selector */}
            <div>
              <Label>{t('items.placeOrdersBy')} *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => canWrite && setSelectedUnit("Pack")}
                  disabled={!canWrite}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "Pack" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  } ${!canWrite ? "opacity-50 cursor-not-allowed" : ""}`}
                  data-testid="edit-unit-pack"
                >
                  <i className="fas fa-box text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.pack')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => canWrite && setSelectedUnit("Single unit")}
                  disabled={!canWrite}
                  className={`flex flex-col items-center py-3 px-2 rounded-lg border-2 transition-all ${
                    selectedUnit === "Single unit" 
                      ? "border-primary bg-primary/10" 
                      : "border-border bg-background"
                  } ${!canWrite ? "opacity-50 cursor-not-allowed" : ""}`}
                  data-testid="edit-unit-single"
                >
                  <i className="fas fa-vial text-xl mb-1"></i>
                  <div className="text-xs font-medium">{t('items.singleUnit')}</div>
                </button>
              </div>
            </div>

            {/* Track Exact Quantity - Only for Pack orders */}
            {selectedUnit === "Pack" && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit-trackExactQuantity" 
                    name="trackExactQuantity"
                    checked={editFormData.trackExactQuantity}
                    onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, trackExactQuantity: checked === true }))}
                    data-testid="checkbox-edit-track-exact-quantity"
                    disabled={!canWrite || editFormData.controlled}
                  />
                  <Label htmlFor="edit-trackExactQuantity" className={(!canWrite || editFormData.controlled) ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}>{t('items.trackExactQuantity')}</Label>
                </div>
                {editFormData.controlled && (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    <i className="fas fa-info-circle mr-1"></i>
                    Required for controlled packed items
                  </p>
                )}
              </div>
            )}

            {/* Pack Size and Current Units - Only shown when Track Exact Quantity is checked */}
            {selectedUnit === "Pack" && editFormData.trackExactQuantity && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-900/50 space-y-4">
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
                    onFocus={handleNumberInputFocus}
                    data-testid="input-edit-pack-size" 
                    required
                    disabled={!canWrite}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('items.packSizeHelp')}</p>
                </div>
                <div>
                  <Label htmlFor="edit-currentUnits">
                    {t('items.currentUnits')} *
                    {editFormData.controlled && (
                      <span className="ml-2 text-xs text-orange-600 dark:text-orange-400 font-normal">(Controlled - use Controller tab)</span>
                    )}
                  </Label>
                  <Input 
                    ref={editCurrentUnitsInputRef}
                    id="edit-currentUnits" 
                    name="currentUnits" 
                    type="number" 
                    min="0"
                    value={editFormData.currentUnits}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, currentUnits: e.target.value }))}
                    onFocus={handleNumberInputFocus}
                    data-testid="input-edit-current-units" 
                    required
                    disabled={!canWrite || editFormData.controlled}
                    readOnly={!canWrite || editFormData.controlled}
                    className={(!canWrite || editFormData.controlled) ? "bg-muted cursor-not-allowed" : ""}
                  />
                  {editFormData.controlled ? (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      <i className="fas fa-lock mr-1"></i>
                      Controlled substance quantities must be adjusted via the Controller tab with proper logging
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">{t('items.currentUnitsHelp')}</p>
                  )}
                </div>
              </div>
            )}

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
              <Label htmlFor="edit-actualStock" className="text-base font-semibold">
                {t('items.actualStock')}
                {editFormData.trackExactQuantity && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">(Auto-calculated)</span>
                )}
              </Label>
              <Input 
                ref={editActualStockInputRef}
                id="edit-actualStock" 
                name="actualStock" 
                type="number" 
                min="0"
                value={editFormData.actualStock}
                onChange={(e) => setEditFormData(prev => ({ ...prev, actualStock: e.target.value }))}
                onFocus={handleNumberInputFocus}
                data-testid="input-edit-actual-stock"
                className="mt-2 text-lg font-medium"
                disabled={!canWrite || editFormData.trackExactQuantity}
                readOnly={!canWrite || editFormData.trackExactQuantity}
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
                  onFocus={handleNumberInputFocus}
                  disabled={!canWrite}
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
                  onFocus={handleNumberInputFocus}
                  disabled={!canWrite}
                  data-testid="input-edit-max" 
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-dailyUsageEstimate">{t('items.dailyUsageEstimate', 'Est. Daily Usage')}</Label>
              <Input 
                id="edit-dailyUsageEstimate" 
                name="dailyUsageEstimate" 
                type="number"
                step="0.01"
                min="0"
                value={editFormData.dailyUsageEstimate}
                onChange={(e) => setEditFormData(prev => ({ ...prev, dailyUsageEstimate: e.target.value }))}
                onFocus={handleNumberInputFocus}
                disabled={!canWrite}
                placeholder="0.00"
                data-testid="input-edit-daily-usage-estimate" 
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('items.dailyUsageEstimateHint', 'Manual fallback for runway calculation when no consumption history exists')}
              </p>
            </div>
              </TabsContent>

              <TabsContent value="invoicing" className="space-y-4 mt-0">
                {!canWrite && (
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                    <i className="fas fa-eye mr-2"></i>
                    {t('common.viewOnly')}
                  </div>
                )}
                
                <div>
                  <Label htmlFor="edit-patientPrice">{t('items.patientPrice', 'Patient Price (CHF)')}</Label>
                  <Input 
                    id="edit-patientPrice" 
                    name="patientPrice" 
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormData.patientPrice}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, patientPrice: e.target.value }))}
                    disabled={!canWrite}
                    placeholder="0.00"
                    data-testid="input-edit-patient-price" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('items.patientPriceHint', 'Final price charged to patients for ambulatory invoices')}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="edit-isInvoiceable" 
                    name="isInvoiceable"
                    checked={editFormData.isInvoiceable}
                    onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, isInvoiceable: checked === true }))}
                    disabled={!canWrite}
                    data-testid="checkbox-edit-invoiceable" 
                  />
                  <Label htmlFor="edit-isInvoiceable" className={!canWrite ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}>
                    {t('items.availableForInvoicing', 'Available for Invoicing')}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('items.availableForInvoicingHint', 'When enabled, this item will appear in the invoice item picker across all units')}
                </p>
              </TabsContent>

              <TabsContent value="codes" className="space-y-6 mt-4">
                {isLoadingCodes ? (
                  <div className="flex items-center justify-center py-8">
                    <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
                  </div>
                ) : (
                  <>
                    {/* Hidden file inputs for photo capture */}
                    <input
                      type="file"
                      ref={editCodesFileInputRef}
                      accept="image/*"
                      capture="environment"
                      onChange={handleEditCodesImageUpload}
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={editCodesGalleryInputRef}
                      accept="image/*"
                      onChange={handleEditCodesImageUpload}
                      className="hidden"
                    />
                    
                    {/* Universal Product Codes Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-barcode text-primary"></i>
                          <h3 className="font-semibold">{t('items.universalCodes')}</h3>
                        </div>
                        {canWrite && (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleTakePhoto('editCodes')}
                              disabled={isAnalyzingEditCodes}
                              data-testid="button-edit-camera-codes"
                            >
                              <i className={`fas ${isAnalyzingEditCodes ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                              {isAnalyzingEditCodes ? t('items.analyzing') : t('controlled.takePhoto')}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => editCodesGalleryInputRef.current?.click()}
                              disabled={isAnalyzingEditCodes}
                              data-testid="button-edit-gallery-codes"
                            >
                              <i className="fas fa-images mr-2"></i>
                              {t('items.uploadFromGallery')}
                            </Button>
                          </div>
                        )}
                      </div>
                      {editCodesImage && (
                        <div className="flex items-center gap-2">
                          <img src={editCodesImage} alt="Codes" className="h-12 w-12 object-cover rounded border" />
                          <span className="text-xs text-muted-foreground">{t('items.photoAnalyzed')}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="gtin">GTIN/EAN</Label>
                          <div className="flex gap-1">
                            <Input 
                              id="gtin"
                              placeholder="e.g., 7680123456789"
                              value={itemCodes?.gtin || ""}
                              onChange={(e) => setItemCodes(prev => ({ ...prev, gtin: e.target.value }))}
                              disabled={!canWrite}
                              data-testid="input-gtin"
                            />
                            {canWrite && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 flex-shrink-0"
                                onClick={() => setScanningEditCodeField('gtin')}
                                data-testid="button-scan-edit-gtin"
                              >
                                <i className="fas fa-barcode text-xs"></i>
                              </Button>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="pharmacode">Pharmacode</Label>
                          <div className="flex gap-1">
                            <Input 
                              id="pharmacode"
                              placeholder="7-digit Swiss code"
                              value={itemCodes?.pharmacode || ""}
                              onChange={(e) => setItemCodes(prev => ({ ...prev, pharmacode: e.target.value }))}
                              disabled={!canWrite}
                              data-testid="input-pharmacode"
                            />
                            {canWrite && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 flex-shrink-0"
                                onClick={() => setScanningEditCodeField('pharmacode')}
                                data-testid="button-scan-edit-pharmacode"
                              >
                                <i className="fas fa-barcode text-xs"></i>
                              </Button>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="migel">MiGeL Code</Label>
                          <div className="flex gap-1">
                            <Input 
                              id="migel"
                              placeholder="Swiss device code"
                              value={itemCodes?.migel || ""}
                              onChange={(e) => setItemCodes(prev => ({ ...prev, migel: e.target.value }))}
                              disabled={!canWrite}
                              data-testid="input-migel"
                            />
                            {canWrite && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 flex-shrink-0"
                                onClick={() => setScanningEditCodeField('migel')}
                                data-testid="button-scan-edit-migel"
                              >
                                <i className="fas fa-barcode text-xs"></i>
                              </Button>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="atc">ATC Code</Label>
                          <div className="flex gap-1">
                            <Input 
                              id="atc"
                              placeholder="e.g., N02BE01"
                              value={itemCodes?.atc || ""}
                              onChange={(e) => setItemCodes(prev => ({ ...prev, atc: e.target.value }))}
                              disabled={!canWrite}
                              data-testid="input-atc"
                            />
                            {canWrite && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 flex-shrink-0"
                                onClick={() => setScanningEditCodeField('atc')}
                                data-testid="button-scan-edit-atc"
                              >
                                <i className="fas fa-barcode text-xs"></i>
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="manufacturer">Manufacturer</Label>
                          <Input 
                            id="manufacturer"
                            placeholder="e.g., B. Braun, 3M"
                            value={itemCodes?.manufacturer || ""}
                            onChange={(e) => setItemCodes(prev => ({ ...prev, manufacturer: e.target.value }))}
                            disabled={!canWrite}
                            data-testid="input-manufacturer"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Supplier Codes Section */}
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-truck text-primary"></i>
                          <h3 className="font-semibold">{t('items.supplierPricing')}</h3>
                        </div>
                      </div>
                      
                      {/* Galexis Auto-Lookup Status */}
                      {(isLookingUpGalexisEdit || galexisEditLookupMessage) && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${isLookingUpGalexisEdit ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : galexisEditLookupMessage?.includes('not found') || galexisEditLookupMessage?.includes('not configured') ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'}`} data-testid="galexis-lookup-status">
                          {isLookingUpGalexisEdit ? (
                            <>
                              <i className="fas fa-spinner fa-spin"></i>
                              <span>{t('items.lookingUpGalexis', 'Looking up in Galexis...')}</span>
                            </>
                          ) : (
                            <>
                              <i className={`fas ${galexisEditLookupMessage?.includes('not found') || galexisEditLookupMessage?.includes('not configured') ? 'fa-info-circle' : 'fa-check-circle'}`}></i>
                              <span>{galexisEditLookupMessage}</span>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Existing Suppliers List */}
                      {supplierCodes.length > 0 && (
                        <div className="space-y-2">
                          {supplierCodes.map((supplier) => (
                            <div 
                              key={supplier.id}
                              className={`p-3 rounded-lg border ${supplier.isPreferred ? 'border-primary bg-primary/5' : 'border-border'}`}
                              data-testid={`supplier-${supplier.id}`}
                            >
                              {editingSupplier?.id === supplier.id ? (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      placeholder="Supplier name *"
                                      value={editingSupplier.supplierName}
                                      onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, supplierName: e.target.value } : null)}
                                      data-testid="input-edit-supplier-name"
                                    />
                                    <Input
                                      placeholder="Article code"
                                      value={editingSupplier.articleCode}
                                      onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, articleCode: e.target.value } : null)}
                                      data-testid="input-edit-supplier-article"
                                    />
                                    <Input
                                      placeholder="Catalog URL"
                                      value={editingSupplier.catalogUrl}
                                      onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, catalogUrl: e.target.value } : null)}
                                      data-testid="input-edit-supplier-url"
                                    />
                                    <Input
                                      placeholder="Price (CHF)"
                                      type="number"
                                      step="0.01"
                                      value={editingSupplier.basispreis}
                                      onChange={(e) => setEditingSupplier(prev => prev ? { ...prev, basispreis: e.target.value } : null)}
                                      data-testid="input-edit-supplier-price"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setEditingSupplier(null)}
                                      data-testid="button-cancel-edit-supplier"
                                    >
                                      {t('common.cancel')}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={!editingSupplier.supplierName}
                                      onClick={async () => {
                                        if (!selectedItem || !editingSupplier.supplierName) return;
                                        try {
                                          await apiRequest("PUT", `/api/items/${selectedItem.id}/suppliers/${editingSupplier.id}`, {
                                            supplierName: editingSupplier.supplierName,
                                            articleCode: editingSupplier.articleCode || null,
                                            catalogUrl: editingSupplier.catalogUrl || null,
                                            basispreis: editingSupplier.basispreis || null,
                                          });
                                          const res = await fetch(`/api/items/${selectedItem.id}/suppliers`);
                                          if (res.ok) setSupplierCodes(await res.json());
                                          setEditingSupplier(null);
                                          toast({ title: t('common.success'), description: "Supplier updated" });
                                        } catch (error: any) {
                                          toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                                        }
                                      }}
                                      data-testid="button-save-edit-supplier"
                                    >
                                      {t('common.save')}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{supplier.supplierName}</span>
                                      {supplier.isPreferred && (
                                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Preferred</span>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted-foreground space-x-3">
                                      {supplier.articleCode && <span>Art: {supplier.articleCode}</span>}
                                      {supplier.basispreis && <span>CHF {supplier.basispreis}</span>}
                                      {supplier.catalogUrl && <span className="text-xs truncate max-w-[150px] inline-block align-bottom">{supplier.catalogUrl}</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {supplier.catalogUrl && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(supplier.catalogUrl, '_blank')}
                                        data-testid={`link-catalog-${supplier.id}`}
                                      >
                                        <i className="fas fa-external-link-alt"></i>
                                      </Button>
                                    )}
                                    {canWrite && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingSupplier({
                                          id: supplier.id,
                                          supplierName: supplier.supplierName,
                                          articleCode: supplier.articleCode || '',
                                          catalogUrl: supplier.catalogUrl || '',
                                          basispreis: supplier.basispreis || '',
                                        })}
                                        data-testid={`button-edit-supplier-${supplier.id}`}
                                      >
                                        <i className="fas fa-edit"></i>
                                      </Button>
                                    )}
                                    {canWrite && !supplier.isPreferred && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          if (!selectedItem) return;
                                          try {
                                            await apiRequest("POST", `/api/items/${selectedItem.id}/suppliers/${supplier.id}/set-preferred`, {});
                                            const res = await fetch(`/api/items/${selectedItem.id}/suppliers`);
                                            if (res.ok) setSupplierCodes(await res.json());
                                            toast({ title: t('common.success'), description: "Set as preferred supplier" });
                                          } catch (error: any) {
                                            toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                                          }
                                        }}
                                        data-testid={`button-set-preferred-${supplier.id}`}
                                      >
                                        <i className="fas fa-star"></i>
                                      </Button>
                                    )}
                                    {canWrite && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          if (!selectedItem || !window.confirm('Delete this supplier?')) return;
                                          try {
                                            await apiRequest("DELETE", `/api/items/${selectedItem.id}/suppliers/${supplier.id}`, {});
                                            setSupplierCodes(prev => prev.filter(s => s.id !== supplier.id));
                                            toast({ title: t('common.success'), description: "Supplier removed" });
                                          } catch (error: any) {
                                            toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                                          }
                                        }}
                                        data-testid={`button-delete-supplier-${supplier.id}`}
                                      >
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Add New Supplier Form */}
                      {canWrite && (
                        <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                          <Label className="text-sm font-medium">Add Supplier</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="Supplier name *"
                              value={newSupplier.supplierName}
                              onChange={(e) => setNewSupplier(prev => ({ ...prev, supplierName: e.target.value }))}
                              data-testid="input-new-supplier-name"
                            />
                            <Input
                              placeholder="Article code"
                              value={newSupplier.articleCode}
                              onChange={(e) => setNewSupplier(prev => ({ ...prev, articleCode: e.target.value }))}
                              data-testid="input-new-supplier-article"
                            />
                            <Input
                              placeholder="Catalog URL"
                              value={newSupplier.catalogUrl}
                              onChange={(e) => setNewSupplier(prev => ({ ...prev, catalogUrl: e.target.value }))}
                              data-testid="input-new-supplier-url"
                            />
                            <Input
                              placeholder="Price per pack (CHF)"
                              type="number"
                              step="0.01"
                              value={newSupplier.basispreis}
                              onChange={(e) => setNewSupplier(prev => ({ ...prev, basispreis: e.target.value }))}
                              data-testid="input-new-supplier-price"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={!newSupplier.supplierName}
                            onClick={async () => {
                              if (!selectedItem || !newSupplier.supplierName) return;
                              try {
                                const res = await apiRequest("POST", `/api/items/${selectedItem.id}/suppliers`, {
                                  supplierName: newSupplier.supplierName,
                                  articleCode: newSupplier.articleCode || null,
                                  catalogUrl: newSupplier.catalogUrl || null,
                                  basispreis: newSupplier.basispreis || null,
                                  isPreferred: supplierCodes.length === 0, // First supplier is auto-preferred
                                });
                                const created = await res.json();
                                setSupplierCodes(prev => [...prev, created]);
                                setNewSupplier({ supplierName: "", articleCode: "", catalogUrl: "", basispreis: "" });
                                toast({ title: t('common.success'), description: "Supplier added" });
                              } catch (error: any) {
                                toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                              }
                            }}
                            data-testid="button-add-supplier"
                          >
                            <i className="fas fa-plus mr-2"></i>
                            Add Supplier
                          </Button>
                        </div>
                      )}

                      {supplierCodes.length === 0 && !canWrite && (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No suppliers configured
                        </div>
                      )}
                    </div>

                    {/* Lot Management Section */}
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <i className="fas fa-boxes text-primary"></i>
                          <h3 className="font-semibold">Lot Tracking</h3>
                        </div>
                        {canWrite && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setLotsScanner(true)}
                            data-testid="button-scan-lot"
                          >
                            <i className="fas fa-qrcode mr-2"></i>
                            Scan Lot
                          </Button>
                        )}
                      </div>
                      
                      {isLoadingLots ? (
                        <div className="flex items-center justify-center py-4">
                          <i className="fas fa-spinner fa-spin text-muted-foreground"></i>
                        </div>
                      ) : (
                        <>
                          {/* Existing Lots List */}
                          {itemLots.length > 0 && (
                            <div className="space-y-2">
                              {itemLots.sort((a, b) => {
                                if (!a.expiryDate && !b.expiryDate) return 0;
                                if (!a.expiryDate) return 1;
                                if (!b.expiryDate) return -1;
                                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                              }).map((lot) => {
                                const isExpired = lot.expiryDate && new Date(lot.expiryDate) < new Date();
                                const isExpiringSoon = lot.expiryDate && !isExpired && new Date(lot.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                                
                                return (
                                  <div 
                                    key={lot.id}
                                    className={`p-3 rounded-lg border ${isExpired ? 'border-destructive bg-destructive/5' : isExpiringSoon ? 'border-yellow-500 bg-yellow-500/5' : 'border-border'}`}
                                    data-testid={`lot-${lot.id}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-medium">{lot.lotNumber}</span>
                                          {isExpired && (
                                            <span className="text-xs bg-destructive text-destructive-foreground px-2 py-0.5 rounded">Expired</span>
                                          )}
                                          {isExpiringSoon && !isExpired && (
                                            <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded">Expiring Soon</span>
                                          )}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                          {lot.expiryDate ? (
                                            <span>Expires: {new Date(lot.expiryDate).toLocaleDateString()}</span>
                                          ) : (
                                            <span>No expiry date</span>
                                          )}
                                        </div>
                                      </div>
                                      {canWrite && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            if (!selectedItem || !window.confirm('Delete this lot?')) return;
                                            try {
                                              await apiRequest("DELETE", `/api/items/${selectedItem.id}/lots/${lot.id}`, {});
                                              setItemLots(prev => prev.filter(l => l.id !== lot.id));
                                              toast({ title: t('common.success'), description: "Lot removed" });
                                            } catch (error: any) {
                                              toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                                            }
                                          }}
                                          data-testid={`button-delete-lot-${lot.id}`}
                                        >
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          
                          {/* Add New Lot Form */}
                          {canWrite && (
                            <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                              <Label className="text-sm font-medium">Add Lot</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Lot number *"
                                  value={newLot.lotNumber}
                                  onChange={(e) => setNewLot(prev => ({ ...prev, lotNumber: e.target.value }))}
                                  data-testid="input-new-lot-number"
                                />
                                <FlexibleDateInput
                                  placeholder="Expiry date"
                                  value={newLot.expiryDate}
                                  onChange={(value) => setNewLot(prev => ({ ...prev, expiryDate: value }))}
                                  data-testid="input-new-lot-expiry"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                disabled={!newLot.lotNumber}
                                onClick={async () => {
                                  if (!selectedItem || !newLot.lotNumber) return;
                                  try {
                                    const res = await apiRequest("POST", `/api/items/${selectedItem.id}/lots`, {
                                      itemId: selectedItem.id,
                                      unitId: effectiveUnitId,
                                      lotNumber: newLot.lotNumber,
                                      expiryDate: newLot.expiryDate ? new Date(newLot.expiryDate).toISOString() : null,
                                    });
                                    const created = await res.json();
                                    setItemLots(prev => [...prev, created]);
                                    setNewLot({ lotNumber: "", expiryDate: "" });
                                    toast({ title: t('common.success'), description: "Lot added" });
                                  } catch (error: any) {
                                    toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                                  }
                                }}
                                data-testid="button-add-lot"
                              >
                                <i className="fas fa-plus mr-2"></i>
                                Add Lot
                              </Button>
                            </div>
                          )}

                          {itemLots.length === 0 && !canWrite && (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              No lots tracked
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="photo" className="space-y-4 mt-4">
                {!canWrite && (
                  <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                    <i className="fas fa-eye mr-2"></i>
                    {t('common.viewOnly')}
                  </div>
                )}
                {editFormData.imageUrl && (
                  <div 
                    className="w-full rounded-lg overflow-hidden border-2 border-border cursor-pointer hover:border-primary transition-colors"
                    onClick={() => {
                      setZoomImageUrl(editFormData.imageUrl);
                      setZoomImageName(editFormData.name || "Item");
                    }}
                    data-testid="edit-item-image-container"
                  >
                    <img 
                      src={editFormData.imageUrl} 
                      alt={editFormData.name || "Item"} 
                      className="w-full h-auto object-contain max-h-[500px]"
                      data-testid="edit-item-image"
                    />
                    <div className="bg-muted/80 text-center py-2 text-sm text-muted-foreground">
                      {t('items.clickToZoom')}
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  ref={editFileInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleEditImageUpload}
                  className="hidden"
                  disabled={!canWrite}
                />
                <input
                  type="file"
                  ref={editGalleryInputRef}
                  accept="image/*"
                  onChange={handleEditImageUpload}
                  className="hidden"
                  disabled={!canWrite}
                />
                {canWrite && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => editFileInputRef.current?.click()}
                        data-testid="button-camera-edit-image"
                      >
                        <i className="fas fa-camera mr-2"></i>
                        {t('controlled.takePhoto')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => editGalleryInputRef.current?.click()}
                        data-testid="button-gallery-edit-image"
                      >
                        <i className="fas fa-images mr-2"></i>
                        {t('items.uploadFromGallery')}
                      </Button>
                    </div>
                    {editFormData.imageUrl && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full"
                        onClick={async () => {
                          if (window.confirm(t('items.deleteImageConfirm'))) {
                            setEditFormData(prev => ({ ...prev, imageUrl: "" }));
                            
                            // Auto-save the deletion immediately
                            if (selectedItem) {
                              try {
                                await apiRequest("PATCH", `/api/items/${selectedItem.id}`, {
                                  imageUrl: null
                                });
                                
                                queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${effectiveUnitId}`, effectiveUnitId] });
                                
                                toast({
                                  title: t('common.success'),
                                  description: t('items.imageDeletedSuccess'),
                                });
                              } catch (error) {
                                console.error('Failed to delete image:', error);
                                toast({
                                  title: t('common.error'),
                                  description: t('items.failedToDeleteImage'),
                                  variant: 'destructive',
                                });
                              }
                            }
                          }
                        }}
                        data-testid="button-delete-image"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('items.deleteImage')}
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </form>
          
          {/* Fixed Footer - visible on all tabs */}
          <div className="flex-shrink-0 bg-background z-10 px-6 py-4 border-t">
            <div className="flex gap-2 justify-between">
              {canWrite ? (
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
              ) : (
                <div></div>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => handleCloseEditDialog()}>
                  {t('common.close')}
                </Button>
                {canWrite && (
                  <Button 
                    type="button" 
                    disabled={updateItemMutation.isPending} 
                    data-testid="button-update-item"
                    onClick={(e) => {
                      e.preventDefault();
                      const form = document.querySelector('form[class*="flex-1"]') as HTMLFormElement;
                      if (form) {
                        form.requestSubmit();
                      }
                    }}
                  >
                    {updateItemMutation.isPending ? t('common.loading') : t('common.save')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkImportOpen} onOpenChange={(open) => {
        setBulkImportOpen(open);
        if (!open) {
          // Reset state when closing
          setImportMode('select');
          setBulkItems([]);
          setBulkImages([]);
          setCsvData([]);
          setCsvHeaders([]);
          setCsvMapping({});
          setBulkImportFolderId(null);
        }
      }}>
        <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col p-0">
          <div className="p-6 border-b">
            <DialogHeader>
              <DialogTitle>{t('items.bulkImportTitle')}</DialogTitle>
              <DialogDescription>Import items from photos (AI analysis) or CSV file</DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto flex-1 p-6">

          {/* Folder Selection */}
          {folders.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="bulk-import-folder">Destination Folder (Optional)</Label>
              <Select
                value={bulkImportFolderId || "root"}
                onValueChange={(value) => setBulkImportFolderId(value === "root" ? null : value)}
              >
                <SelectTrigger id="bulk-import-folder" data-testid="select-bulk-import-folder">
                  <SelectValue placeholder="Select a folder or leave as root" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Root (No folder)</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <FolderIcon className="w-4 h-4 inline mr-2" />
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {importMode === 'select' && bulkItems.length === 0 ? (
            <div className="space-y-4">
              <input
                type="file"
                ref={bulkFileInputRef}
                accept="image/*,.csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                multiple
                onChange={handleBulkImageUpload}
                className="hidden"
              />
              <input
                type="file"
                ref={barcodeFileInputRef}
                accept="image/*"
                multiple
                onChange={handleBarcodeImageUpload}
                className="hidden"
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 flex flex-col border-2 border-primary bg-primary/5"
                  onClick={() => barcodeFileInputRef.current?.click()}
                  disabled={isBulkAnalyzing}
                  data-testid="button-bulk-barcodes"
                >
                  <i className={`fas ${isBulkAnalyzing ? 'fa-spinner fa-spin' : 'fa-barcode'} text-4xl mb-2 text-primary`}></i>
                  <div className="font-semibold">{isBulkAnalyzing ? t('items.analyzing') : t('items.scanBarcodes')}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t('items.scanBarcodesDesc')}</div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 flex flex-col"
                  onClick={() => bulkFileInputRef.current?.click()}
                  disabled={isBulkAnalyzing}
                  data-testid="button-bulk-upload"
                >
                  <i className={`fas ${isBulkAnalyzing ? 'fa-spinner fa-spin' : 'fa-camera'} text-4xl mb-2`}></i>
                  <div className="font-semibold">{isBulkAnalyzing ? t('items.analyzing') : t('items.uploadPhotos')}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t('items.uploadPhotosDesc')}</div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 flex flex-col"
                  onClick={() => bulkFileInputRef.current?.click()}
                  data-testid="button-csv-upload"
                >
                  <i className="fas fa-file-excel text-4xl mb-2"></i>
                  <div className="font-semibold">{t('items.uploadCsvExcel')}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t('items.uploadCsvExcelDesc')}</div>
                </Button>
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={downloadItemsCatalog}
                  data-testid="button-download-items-catalog"
                >
                  <i className="fas fa-download mr-2"></i>
                  Download Items Catalog
                </Button>
              </div>
              {bulkImages.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {bulkImages.map((img, idx) => (
                    <img key={idx} src={img} alt={`Preview ${idx + 1}`} className="w-full h-20 object-cover rounded border" />
                  ))}
                </div>
              )}
            </div>
          ) : importMode === 'csv' ? (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>CSV Data Preview</strong> ({csvData.length} rows found)
              </div>
              
              {/* CSV Preview Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {csvHeaders.map(header => (
                          <th key={header} className="px-2 py-1 text-left font-medium">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="border-t">
                          {csvHeaders.map(header => (
                            <td key={header} className="px-2 py-1">{row[header]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Field Mapping */}
              <div className="space-y-3">
                <div className="text-sm font-medium">Map CSV Columns to Item Fields</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['name', 'description', 'unit', 'initialStock', 'minThreshold', 'maxThreshold', 'packSize', 'critical', 'controlled', 'imageUrl', 'barcodes', 'patientPrice'].map(field => (
                    <div key={field}>
                      <Label className="text-xs">
                        {field === 'name' && '* '}
                        {field === 'initialStock' ? 'Stock' : field === 'minThreshold' ? 'Min' : field === 'maxThreshold' ? 'Max' : field === 'patientPrice' ? 'Patient Price (Final)' : field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                      </Label>
                      <Select
                        value={Object.entries(csvMapping).find(([_, target]) => target === field)?.[0] || 'skip'}
                        onValueChange={(value) => {
                          const newMapping = { ...csvMapping };
                          // Remove any existing mapping to this target field
                          Object.keys(newMapping).forEach(key => {
                            if (newMapping[key] === field) delete newMapping[key];
                          });
                          // Add new mapping if not 'skip'
                          if (value !== 'skip') {
                            newMapping[value] = field;
                          }
                          setCsvMapping(newMapping);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid={`select-mapping-${field}`}>
                          <SelectValue placeholder="Skip field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">-- Skip this field --</SelectItem>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medication Configuration */}
              <Accordion type="single" collapsible className="border rounded-lg">
                <AccordionItem value="medication" className="border-0">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Medication Configuration (Optional)</span>
                      <span className="text-xs text-muted-foreground">
                        {Object.values(csvMapping).filter(v => ['medicationGroup', 'administrationRoute', 'defaultDose', 'ampuleQuantity', 'ampuleUnit', 'administrationUnit', 'rateUnit'].includes(v)).length > 0 
                          ? `${Object.values(csvMapping).filter(v => ['medicationGroup', 'administrationRoute', 'defaultDose', 'ampuleQuantity', 'ampuleUnit', 'administrationUnit', 'rateUnit'].includes(v)).length} fields mapped`
                          : 'For anesthesia records'}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                      {[
                        { key: 'medicationGroup', label: 'Medication Group' },
                        { key: 'administrationRoute', label: 'Administration Route' },
                        { key: 'defaultDose', label: 'Default Dose' },
                        { key: 'ampuleQuantity', label: 'Ampule Quantity' },
                        { key: 'ampuleUnit', label: 'Ampule Unit' },
                        { key: 'administrationUnit', label: 'Administration Unit' },
                        { key: 'rateUnit', label: 'Rate Unit (null=bolus, "free"=free-flow, unit=rate-controlled)' },
                      ].map(({ key, label}) => (
                        <div key={key}>
                          <Label className="text-xs">{label}</Label>
                          <Select
                            value={Object.entries(csvMapping).find(([_, target]) => target === key)?.[0] || 'skip'}
                            onValueChange={(value) => {
                              const newMapping = { ...csvMapping };
                              // Remove any existing mapping to this target field
                              Object.keys(newMapping).forEach(k => {
                                if (newMapping[k] === key) delete newMapping[k];
                              });
                              // Add new mapping if not 'skip'
                              if (value !== 'skip') {
                                newMapping[value] = key;
                              }
                              setCsvMapping(newMapping);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-mapping-${key}`}>
                              <SelectValue placeholder="Skip field" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">-- Skip this field --</SelectItem>
                              {csvHeaders.map(header => (
                                <SelectItem key={header} value={header}>{header}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Item Codes Configuration */}
              <Accordion type="single" collapsible className="border rounded-lg">
                <AccordionItem value="itemCodes" className="border-0">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Item Codes (Optional)</span>
                      <span className="text-xs text-muted-foreground">
                        {Object.values(csvMapping).filter(v => ['gtin', 'pharmacode', 'swissmedicNr', 'migel', 'atc', 'manufacturer', 'manufacturerRef', 'packContent', 'unitsPerPack', 'contentPerUnit', 'abgabekategorie'].includes(v)).length > 0 
                          ? `${Object.values(csvMapping).filter(v => ['gtin', 'pharmacode', 'swissmedicNr', 'migel', 'atc', 'manufacturer', 'manufacturerRef', 'packContent', 'unitsPerPack', 'contentPerUnit', 'abgabekategorie'].includes(v)).length} fields mapped`
                          : 'For catalog transfer'}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                      {[
                        { key: 'gtin', label: 'GTIN/EAN' },
                        { key: 'pharmacode', label: 'Pharmacode' },
                        { key: 'swissmedicNr', label: 'Swissmedic Nr' },
                        { key: 'migel', label: 'MiGeL' },
                        { key: 'atc', label: 'ATC Code' },
                        { key: 'manufacturer', label: 'Manufacturer' },
                        { key: 'manufacturerRef', label: 'Manufacturer Ref' },
                        { key: 'packContent', label: 'Pack Content' },
                        { key: 'unitsPerPack', label: 'Units Per Pack' },
                        { key: 'contentPerUnit', label: 'Content Per Unit' },
                        { key: 'abgabekategorie', label: 'Abgabekategorie' },
                      ].map(({ key, label}) => (
                        <div key={key}>
                          <Label className="text-xs">{label}</Label>
                          <Select
                            value={Object.entries(csvMapping).find(([_, target]) => target === key)?.[0] || 'skip'}
                            onValueChange={(value) => {
                              const newMapping = { ...csvMapping };
                              Object.keys(newMapping).forEach(k => {
                                if (newMapping[k] === key) delete newMapping[k];
                              });
                              if (value !== 'skip') {
                                newMapping[value] = key;
                              }
                              setCsvMapping(newMapping);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-mapping-${key}`}>
                              <SelectValue placeholder="Skip field" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">-- Skip this field --</SelectItem>
                              {csvHeaders.map(header => (
                                <SelectItem key={header} value={header}>{header}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Supplier Configuration */}
              <Accordion type="single" collapsible className="border rounded-lg">
                <AccordionItem value="supplier" className="border-0">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Supplier Info (Optional)</span>
                      <span className="text-xs text-muted-foreground">
                        {Object.values(csvMapping).filter(v => ['preferredSupplier', 'supplierArticleCode', 'supplierPrice'].includes(v)).length > 0 
                          ? `${Object.values(csvMapping).filter(v => ['preferredSupplier', 'supplierArticleCode', 'supplierPrice'].includes(v)).length} fields mapped`
                          : 'For catalog transfer'}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                      {[
                        { key: 'preferredSupplier', label: 'Preferred Supplier' },
                        { key: 'supplierArticleCode', label: 'Supplier Article Code' },
                        { key: 'supplierPrice', label: 'Supplier Price' },
                      ].map(({ key, label}) => (
                        <div key={key}>
                          <Label className="text-xs">{label}</Label>
                          <Select
                            value={Object.entries(csvMapping).find(([_, target]) => target === key)?.[0] || 'skip'}
                            onValueChange={(value) => {
                              const newMapping = { ...csvMapping };
                              Object.keys(newMapping).forEach(k => {
                                if (newMapping[k] === key) delete newMapping[k];
                              });
                              if (value !== 'skip') {
                                newMapping[value] = key;
                              }
                              setCsvMapping(newMapping);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-mapping-${key}`}>
                              <SelectValue placeholder="Skip field" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">-- Skip this field --</SelectItem>
                              {csvHeaders.map(header => (
                                <SelectItem key={header} value={header}>{header}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setImportMode('select'); setCsvData([]); setCsvHeaders([]); setCsvMapping({}); }}>
                  Cancel
                </Button>
                <Button onClick={processCsvData} data-testid="button-process-csv">
                  Process CSV ({csvData.length} rows)
                </Button>
              </div>
            </div>
          ) : null}
          
          {bulkItems.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {t('items.reviewItems')}
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {bulkItems.map((item, idx) => (
                  <div key={idx} className={`p-3 border rounded-lg space-y-2 ${item.error ? 'border-red-300 bg-red-50/50 dark:bg-red-900/10' : item.galexisFound ? 'border-green-300 bg-green-50/50 dark:bg-green-900/10' : ''}`} data-testid={`bulk-item-${idx}`}>
                    {/* Source badge and GTIN for barcode imports */}
                    {importMode === 'barcodes' && (
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {item.source === 'galexis' && (
                            <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-medium">
                              <i className="fas fa-check-circle mr-1"></i>{t('items.sourceGalexis')}
                            </span>
                          )}
                          {item.source === 'ocr' && !item.galexisFound && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
                              <i className="fas fa-eye mr-1"></i>{t('items.sourceOcr')}
                            </span>
                          )}
                          {item.error && (
                            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium">
                              <i className="fas fa-exclamation-triangle mr-1"></i>{t('items.sourceError')}
                            </span>
                          )}
                          {item.gtin && (
                            <span className="text-xs text-muted-foreground font-mono">GTIN: {item.gtin}</span>
                          )}
                          {item.pharmacode && (
                            <span className="text-xs text-muted-foreground font-mono">Pharmacode: {item.pharmacode}</span>
                          )}
                        </div>
                        {item.yourPrice && (
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground">{t('items.yourPrice')}: </span>
                            <span className="text-sm font-semibold text-green-600">CHF {item.yourPrice.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {item.error ? (
                      <div className="text-sm text-red-600">{item.error}</div>
                    ) : (
                      <>
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
                      </>
                    )}
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
          </div>
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
                  <Button variant="outline" onClick={() => { handleDismissOnboarding(); setDirectCameraOpen(true); }} className="w-full" data-testid="onboarding-add-item">
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

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent data-testid="bulk-delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirm(false)}
              data-testid="cancel-bulk-delete-dialog"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              data-testid="confirm-bulk-delete-dialog"
            >
              {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete Items'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pack Size Confirmation Dialog */}
      <Dialog 
        open={packSizeConfirmDialog?.open || false} 
        onOpenChange={(open) => !open && setPackSizeConfirmDialog(null)}
      >
        <DialogContent data-testid="pack-size-confirm-dialog">
          <DialogHeader>
            <DialogTitle>
              {packSizeConfirmDialog?.mode === 'confirm_add' 
                ? t('items.packSizeDetected', 'Pack Size Detected')
                : t('items.packSizeMismatch', 'Pack Size Mismatch')
              }
            </DialogTitle>
            <DialogDescription>
              {packSizeConfirmDialog?.mode === 'confirm_add' 
                ? t('items.packSizeDetectedDesc', 'A pack size of {{size}} was found in the product name. Would you like to set this as the pack size?', { size: packSizeConfirmDialog?.extractedSize })
                : t('items.packSizeMismatchDesc', 'The detected pack size ({{extracted}}) differs from the current value ({{current}}). Which value would you like to use?', { 
                    extracted: packSizeConfirmDialog?.extractedSize, 
                    current: packSizeConfirmDialog?.currentSize 
                  })
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            {packSizeConfirmDialog?.mode === 'confirm_add' ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setPackSizeConfirmDialog(null)}
                  data-testid="pack-size-cancel"
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button 
                  onClick={() => {
                    if (packSizeConfirmDialog) {
                      setEditFormData(prev => ({ ...prev, packSize: String(packSizeConfirmDialog.extractedSize) }));
                      toast({
                        title: t('items.packSizeUpdated', 'Pack Size Updated'),
                        description: `${t('items.packSize', 'Pack Size')}: ${packSizeConfirmDialog.extractedSize}`,
                      });
                    }
                    setPackSizeConfirmDialog(null);
                  }}
                  data-testid="pack-size-confirm"
                >
                  {t('items.setPackSize', 'Set Pack Size')}
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setPackSizeConfirmDialog(null)}
                  data-testid="pack-size-keep-current"
                >
                  {t('items.keepCurrent', 'Keep Current')} ({packSizeConfirmDialog?.currentSize})
                </Button>
                <Button 
                  onClick={() => {
                    if (packSizeConfirmDialog) {
                      setEditFormData(prev => ({ ...prev, packSize: String(packSizeConfirmDialog.extractedSize) }));
                      toast({
                        title: t('items.packSizeUpdated', 'Pack Size Updated'),
                        description: `${t('items.packSize', 'Pack Size')}: ${packSizeConfirmDialog.extractedSize}`,
                      });
                    }
                    setPackSizeConfirmDialog(null);
                  }}
                  data-testid="pack-size-use-extracted"
                >
                  {t('items.useExtracted', 'Use Extracted')} ({packSizeConfirmDialog?.extractedSize})
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Name Confirmation Dialog */}
      <Dialog 
        open={nameConfirmDialog?.open || false} 
        onOpenChange={(open) => !open && setNameConfirmDialog(null)}
      >
        <DialogContent data-testid="name-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t('items.nameMismatch', 'Name Mismatch')}</DialogTitle>
            <DialogDescription>
              {t('items.nameMismatchDesc', 'The supplier name differs from the current item name. Which name would you like to use?')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 my-4">
            <div 
              className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${
                nameConfirmDialog?.selectedName === 'current' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-muted bg-muted/50 hover:border-muted-foreground/30'
              }`}
              onClick={() => nameConfirmDialog && setNameConfirmDialog({ ...nameConfirmDialog, selectedName: 'current' })}
              data-testid="name-option-current"
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  nameConfirmDialog?.selectedName === 'current' 
                    ? 'border-primary' 
                    : 'border-muted-foreground/40'
                }`}>
                  {nameConfirmDialog?.selectedName === 'current' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">{t('items.currentName', 'Current Name')}</p>
                  <p className="font-medium">{nameConfirmDialog?.currentName}</p>
                </div>
              </div>
            </div>
            <div 
              className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${
                nameConfirmDialog?.selectedName === 'supplier' 
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                  : 'border-muted bg-muted/50 hover:border-muted-foreground/30'
              }`}
              onClick={() => nameConfirmDialog && setNameConfirmDialog({ ...nameConfirmDialog, selectedName: 'supplier' })}
              data-testid="name-option-supplier"
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  nameConfirmDialog?.selectedName === 'supplier' 
                    ? 'border-primary' 
                    : 'border-muted-foreground/40'
                }`}>
                  {nameConfirmDialog?.selectedName === 'supplier' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">{t('items.supplierName', 'Supplier Name')}</p>
                  <p className="font-medium">{nameConfirmDialog?.supplierName}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button 
              onClick={() => {
                if (nameConfirmDialog) {
                  if (nameConfirmDialog.selectedName === 'supplier') {
                    setEditFormData(prev => ({ ...prev, name: nameConfirmDialog.supplierName }));
                    toast({
                      title: t('items.nameUpdated', 'Name Updated'),
                      description: nameConfirmDialog.supplierName,
                    });
                  }
                }
                setNameConfirmDialog(null);
              }}
              data-testid="name-confirm-save"
            >
              {t('common.save', 'Save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={bulkMoveDialogOpen} onOpenChange={(open) => {
        setBulkMoveDialogOpen(open);
        if (!open) setBulkMoveTargetUnitId("");
      }}>
        <DialogContent data-testid="bulk-move-dialog">
          <DialogHeader>
            <DialogTitle>{t('items.bulkMoveTitle', 'Move Items to Another Unit')}</DialogTitle>
            <DialogDescription>
              {t('items.bulkMoveDesc', `Move ${selectedItems.size} selected item(s) to a different unit. This is an administrative reassignment.`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t('items.targetUnit', 'Target Unit')}</Label>
              <Select value={bulkMoveTargetUnitId} onValueChange={setBulkMoveTargetUnitId}>
                <SelectTrigger data-testid="select-bulk-move-target">
                  <SelectValue placeholder={t('items.selectUnit', 'Select a unit...')} />
                </SelectTrigger>
                <SelectContent>
                  {availableDestinationUnits
                    .filter(unit => (unit as any).showInventory !== false)
                    .map((unit) => (
                      <SelectItem key={unit.id} value={unit.id} data-testid={`bulk-move-unit-${unit.id}`}>
                        {unit.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setBulkMoveDialogOpen(false)}
              data-testid="cancel-bulk-move-dialog"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => {
                if (bulkMoveTargetUnitId && selectedItems.size > 0) {
                  bulkMoveMutation.mutate({
                    itemIds: Array.from(selectedItems),
                    targetUnitId: bulkMoveTargetUnitId
                  });
                }
              }}
              disabled={!bulkMoveTargetUnitId || bulkMoveMutation.isPending}
              data-testid="confirm-bulk-move-dialog"
            >
              {bulkMoveMutation.isPending ? t('common.moving', 'Moving...') : t('items.moveItems', 'Move Items')}
            </Button>
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

      {/* Image Zoom Dialog */}
      <Dialog open={!!zoomImageUrl} onOpenChange={() => setZoomImageUrl(null)}>
        <DialogContent className="max-w-full w-full h-full max-h-screen p-0 m-0 border-0" data-testid="image-zoom-dialog">
          <DialogTitle className="sr-only">{t('items.itemImage')}</DialogTitle>
          <DialogDescription className="sr-only">{zoomImageName}</DialogDescription>
          <div className="relative w-full h-full bg-black/95 flex items-center justify-center">
            <Button
              variant="ghost"
              className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
              onClick={() => setZoomImageUrl(null)}
              data-testid="button-close-zoom"
            >
              <X className="w-6 h-6" />
            </Button>
            {zoomImageUrl && (
              <img
                src={zoomImageUrl}
                alt={zoomImageName}
                className="max-w-full max-h-full object-contain p-4"
                data-testid="zoomed-image"
              />
            )}
            <div className="absolute bottom-4 left-4 right-4 text-center text-white text-sm bg-black/50 py-2 rounded">
              {zoomImageName}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* GS1/DataMatrix Code Scanner for Codes Tab */}
      <BarcodeScanner
        isOpen={codesScanner}
        onClose={() => setCodesScanner(false)}
        onScan={(code) => {
          setCodesScanner(false);
          
          if (isGS1Code(code)) {
            const parsed = parseGS1Code(code);
            
            setItemCodes(prev => ({
              ...prev,
              gtin: parsed.gtin || prev?.gtin,
              manufacturer: prev?.manufacturer,
              packContent: prev?.packContent,
              unitsPerPack: prev?.unitsPerPack,
            }));
            
            toast({
              title: "Code Scanned",
              description: `GTIN: ${parsed.gtin || 'N/A'}${parsed.lotNumber ? `, LOT: ${parsed.lotNumber}` : ''}${parsed.expiryDate ? `, EXP: ${parsed.expiryDate}` : ''}`,
            });
          } else if (/^\d{13,14}$/.test(code)) {
            setItemCodes(prev => ({
              ...prev,
              gtin: code.padStart(14, '0'),
            }));
            toast({
              title: "Barcode Scanned",
              description: `GTIN: ${code}`,
            });
          } else if (/^\d{7}$/.test(code)) {
            setItemCodes(prev => ({
              ...prev,
              pharmacode: code,
            }));
            toast({
              title: "Pharmacode Scanned",
              description: `Pharmacode: ${code}`,
            });
          } else {
            toast({
              title: "Code Scanned",
              description: `Raw value: ${code}`,
            });
          }
        }}
        onManualEntry={() => {
          setCodesScanner(false);
        }}
      />
      
      {/* GS1/DataMatrix Scanner for Lot Tracking */}
      <BarcodeScanner
        isOpen={lotsScanner}
        onClose={() => setLotsScanner(false)}
        onScan={(code) => {
          setLotsScanner(false);
          
          if (isGS1Code(code)) {
            const parsed = parseGS1Code(code);
            
            if (parsed.lotNumber) {
              // GS1 parser already returns dates in YYYY-MM-DD format
              const expiryDate = parsed.expiryDate || "";
              
              setNewLot({
                lotNumber: parsed.lotNumber,
                expiryDate: expiryDate,
              });
              
              toast({
                title: "Lot Scanned",
                description: `LOT: ${parsed.lotNumber}${parsed.expiryDate ? `, EXP: ${parsed.expiryDate}` : ''}`,
              });
            } else {
              toast({
                title: "No Lot Found",
                description: "The scanned code does not contain lot information",
                variant: "destructive",
              });
            }
          } else {
            setNewLot(prev => ({
              ...prev,
              lotNumber: code,
            }));
            toast({
              title: "Code Scanned",
              description: `Value: ${code}`,
            });
          }
        }}
        onManualEntry={() => {
          setLotsScanner(false);
        }}
      />

      {/* GS1/DataMatrix Scanner for Add Item Flow */}
      <BarcodeScanner
        isOpen={addItemScanner}
        onClose={() => setAddItemScanner(false)}
        onScan={(code) => {
          setAddItemScanner(false);
          
          if (isGS1Code(code)) {
            const parsed = parseGS1Code(code);
            
            setFormData(prev => ({
              ...prev,
              gtin: parsed.gtin || prev.gtin,
              lotNumber: parsed.lotNumber || prev.lotNumber,
              expiryDate: parsed.expiryDate || prev.expiryDate,
            }));
            
            toast({
              title: t('items.barcodeScanned'),
              description: `GTIN: ${parsed.gtin || 'N/A'}${parsed.lotNumber ? `, LOT: ${parsed.lotNumber}` : ''}${parsed.expiryDate ? `, EXP: ${parsed.expiryDate}` : ''}`,
            });
          } else if (/^\d{13,14}$/.test(code)) {
            setFormData(prev => ({
              ...prev,
              gtin: code.padStart(14, '0'),
            }));
            toast({
              title: t('items.barcodeScanned'),
              description: `GTIN: ${code}`,
            });
          } else if (/^\d{7}$/.test(code)) {
            setFormData(prev => ({
              ...prev,
              pharmacode: code,
            }));
            toast({
              title: t('items.pharmacodeScanned'),
              description: `Pharmacode: ${code}`,
            });
          } else {
            toast({
              title: t('items.codeScanned'),
              description: `${t('items.rawValue')}: ${code}`,
            });
          }
        }}
        onManualEntry={() => {
          setAddItemScanner(false);
        }}
      />
      
      {/* Individual Code Field Scanner for Add Item */}
      <BarcodeScanner
        isOpen={scanningCodeField !== null}
        onClose={() => setScanningCodeField(null)}
        onScan={(code) => {
          if (scanningCodeField) {
            handleAddItemCodeScan(code);
          }
        }}
        onManualEntry={() => {
          setScanningCodeField(null);
        }}
      />
      
      {/* Individual Code Field Scanner for Edit Item Codes */}
      <BarcodeScanner
        isOpen={scanningEditCodeField !== null}
        onClose={() => setScanningEditCodeField(null)}
        onScan={(code) => {
          if (scanningEditCodeField) {
            handleEditItemCodeScan(code);
          }
        }}
        onManualEntry={() => {
          setScanningEditCodeField(null);
        }}
      />
      

      {/* Transfer Items Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => {
        setTransferDialogOpen(open);
        if (!open) {
          setTransferItems([]);
          setTransferTargetUnitId("");
          setTransferSearchTerm("");
          setTransferDirection('to');
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('items.transferItems', 'Transfer Items')}</DialogTitle>
            <DialogDescription>
              {t('items.transferItemsDesc', 'Move items between hospital units. Items will be matched by pharmacode/GTIN at the destination.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Transfer Direction Selection */}
            <div className="space-y-2">
              <Label>{t('items.transferDirection', 'Transfer Direction')}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={transferDirection === 'to' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => {
                    setTransferDirection('to');
                    setTransferItems([]);
                  }}
                  data-testid="button-transfer-direction-to"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {t('items.transferTo', 'Transfer To')}
                </Button>
                <Button
                  type="button"
                  variant={transferDirection === 'from' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => {
                    setTransferDirection('from');
                    setTransferItems([]);
                  }}
                  data-testid="button-transfer-direction-from"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('items.transferFrom', 'Transfer From')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {transferDirection === 'to' 
                  ? t('items.transferToDesc', 'Send items from this unit to the selected unit')
                  : t('items.transferFromDesc', 'Receive items from the selected unit to this unit')
                }
              </p>
            </div>

            {/* Target Unit Selection */}
            <div className="space-y-2">
              <Label>
                {transferDirection === 'to' 
                  ? t('items.destinationUnit', 'Destination Unit')
                  : t('items.sourceUnit', 'Source Unit')
                }
              </Label>
              <Select value={transferTargetUnitId} onValueChange={(value) => {
                setTransferTargetUnitId(value);
                if (transferDirection === 'from') {
                  setTransferItems([]);
                }
              }}>
                <SelectTrigger data-testid="select-target-unit">
                  <SelectValue placeholder={
                    transferDirection === 'to'
                      ? t('items.selectDestinationUnit', 'Select destination unit...')
                      : t('items.selectSourceUnit', 'Select source unit...')
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableDestinationUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item Search/Add */}
            <div className="space-y-2">
              <Label>{t('items.addItemsToTransfer', 'Add Items to Transfer')}</Label>
              
              {/* Show message if 'from' direction but no source unit selected */}
              {transferDirection === 'from' && !transferTargetUnitId && (
                <div className="p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground">
                  {t('items.selectSourceFirst', 'Please select a source unit first')}
                </div>
              )}
              
              {/* Show loading state when fetching source unit items */}
              {transferDirection === 'from' && transferTargetUnitId && isLoadingSourceItems && (
                <div className="p-4 border rounded-lg text-center">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  {t('items.loadingItems', 'Loading items...')}
                </div>
              )}
              
              {/* Show search when ready */}
              {(transferDirection === 'to' || (transferDirection === 'from' && transferTargetUnitId && !isLoadingSourceItems)) && (
                <>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('items.searchByNameOrCode', 'Search by name, pharmacode, or GTIN...')}
                        value={transferSearchTerm}
                        onChange={(e) => setTransferSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="input-transfer-search"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setTransferScanner(true)}
                      data-testid="button-transfer-scan"
                    >
                      <i className="fas fa-barcode"></i>
                    </Button>
                  </div>

                  {/* Filtered Items List for Selection */}
                  {transferSearchTerm.trim() && (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {transferSourceItems
                        .filter(item => {
                          const search = transferSearchTerm.toLowerCase();
                          const codes = transferSourceCodesMap.get(item.id);
                          const alreadyAdded = transferItems.some(ti => ti.itemId === item.id);
                          if (alreadyAdded) return false;
                          
                          return (
                            item.name.toLowerCase().includes(search) ||
                            codes?.pharmacode?.toLowerCase().includes(search) ||
                            codes?.gtin?.toLowerCase().includes(search)
                          );
                        })
                        .slice(0, 10)
                        .map(item => {
                          const codes = transferSourceCodesMap.get(item.id);
                          const stockQty = item.stockLevel?.qtyOnHand || 0;
                          
                          return (
                            <div
                              key={item.id}
                              className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                              onClick={() => {
                                setTransferItems(prev => [...prev, {
                                  itemId: item.id,
                                  name: item.name,
                                  packSize: item.packSize || 1,
                                  trackExactQuantity: item.trackExactQuantity || false,
                                  currentUnits: item.currentUnits || 0,
                                  stockQty,
                                  transferType: 'packs',
                                  transferQty: 1,
                                  pharmacode: codes?.pharmacode,
                                  gtin: codes?.gtin,
                                }]);
                                setTransferSearchTerm("");
                              }}
                              data-testid={`transfer-item-option-${item.id}`}
                            >
                              <div>
                                <p className="font-medium">{item.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {codes?.pharmacode && `PC: ${codes.pharmacode}`}
                                  {codes?.pharmacode && codes?.gtin && ' | '}
                                  {codes?.gtin && `GTIN: ${codes.gtin}`}
                                </p>
                              </div>
                              <div className="text-right text-sm">
                                <p>{t('items.stock')}: {stockQty}</p>
                                {item.trackExactQuantity && (
                                  <p className="text-muted-foreground">{t('items.units')}: {item.currentUnits || 0}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      {transferSourceItems.filter(item => {
                        const search = transferSearchTerm.toLowerCase();
                        const codes = transferSourceCodesMap.get(item.id);
                        const alreadyAdded = transferItems.some(ti => ti.itemId === item.id);
                        if (alreadyAdded) return false;
                        return (
                          item.name.toLowerCase().includes(search) ||
                          codes?.pharmacode?.toLowerCase().includes(search) ||
                          codes?.gtin?.toLowerCase().includes(search)
                        );
                      }).length === 0 && (
                        <div className="p-4 text-center text-muted-foreground">
                          {t('items.noItemsFound', 'No items found')}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Selected Items for Transfer */}
            {transferItems.length > 0 && (
              <div className="space-y-2">
                <Label>{t('items.itemsToTransfer', 'Items to Transfer')} ({transferItems.length})</Label>
                <div className="space-y-2">
                  {transferItems.map((item, idx) => (
                    <div key={item.itemId} className="border rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.pharmacode && `PC: ${item.pharmacode}`}
                            {item.pharmacode && item.gtin && ' | '}
                            {item.gtin && `GTIN: ${item.gtin}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setTransferItems(prev => prev.filter((_, i) => i !== idx));
                          }}
                          data-testid={`remove-transfer-item-${item.itemId}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {/* Transfer Type Selection (for trackExactQuantity items) */}
                        {item.trackExactQuantity && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">{t('items.transferAs', 'Transfer as')}:</Label>
                            <Select
                              value={item.transferType}
                              onValueChange={(value: 'packs' | 'units') => {
                                setTransferItems(prev => prev.map((ti, i) => 
                                  i === idx ? { ...ti, transferType: value, transferQty: 1 } : ti
                                ));
                              }}
                            >
                              <SelectTrigger className="w-24 h-8" data-testid={`select-transfer-type-${item.itemId}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="packs">{t('items.packs', 'Packs')}</SelectItem>
                                <SelectItem value="units">{t('items.units', 'Units')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        {/* Quantity Input */}
                        <div className="flex items-center gap-2 flex-1">
                          <Label className="text-sm whitespace-nowrap">
                            {item.transferType === 'units' ? t('items.units', 'Units') : t('items.qty', 'Qty')}:
                          </Label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setTransferItems(prev => prev.map((ti, i) => 
                                  i === idx ? { ...ti, transferQty: Math.max(1, ti.transferQty - 1) } : ti
                                ));
                              }}
                              data-testid={`decrease-qty-${item.itemId}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              max={item.transferType === 'units' ? item.currentUnits : item.stockQty}
                              value={item.transferQty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                const max = item.transferType === 'units' ? item.currentUnits : item.stockQty;
                                setTransferItems(prev => prev.map((ti, i) => 
                                  i === idx ? { ...ti, transferQty: Math.min(Math.max(1, val), max) } : ti
                                ));
                              }}
                              className="w-16 h-8 text-center"
                              data-testid={`input-transfer-qty-${item.itemId}`}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                const max = item.transferType === 'units' ? item.currentUnits : item.stockQty;
                                setTransferItems(prev => prev.map((ti, i) => 
                                  i === idx ? { ...ti, transferQty: Math.min(ti.transferQty + 1, max) } : ti
                                ));
                              }}
                              data-testid={`increase-qty-${item.itemId}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            / {item.transferType === 'units' ? item.currentUnits : item.stockQty} {t('items.available', 'available')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setTransferDialogOpen(false);
                setTransferItems([]);
                setTransferTargetUnitId("");
                setTransferDirection('to');
              }}
              data-testid="button-cancel-transfer"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (transferTargetUnitId && transferItems.length > 0 && effectiveUnitId) {
                  const sourceUnitId = transferDirection === 'to' 
                    ? effectiveUnitId 
                    : transferTargetUnitId;
                  const destinationUnitId = transferDirection === 'to' 
                    ? transferTargetUnitId 
                    : effectiveUnitId;
                  
                  transferItemsMutation.mutate({
                    sourceUnitId,
                    destinationUnitId,
                    items: transferItems.map(item => ({
                      itemId: item.itemId,
                      transferType: item.transferType,
                      transferQty: item.transferQty,
                      pharmacode: item.pharmacode,
                      gtin: item.gtin,
                    })),
                  });
                }
              }}
              disabled={!transferTargetUnitId || transferItems.length === 0 || transferItemsMutation.isPending}
              data-testid="button-confirm-transfer"
            >
              {transferItemsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4 mr-2" />
              )}
              {t('items.confirmTransfer', 'Transfer Items')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Items Barcode Scanner */}
      <BarcodeScanner
        isOpen={transferScanner}
        onClose={() => setTransferScanner(false)}
        onScan={(code) => {
          setTransferScanner(false);
          
          // Find item by pharmacode or GTIN
          let foundItem: ItemWithStock | undefined;
          let foundCodes: { gtin?: string; pharmacode?: string } | undefined;
          
          for (const item of items) {
            const codes = itemCodesMap.get(item.id);
            if (codes?.pharmacode === code || codes?.gtin === code) {
              foundItem = item;
              foundCodes = codes;
              break;
            }
          }
          
          if (foundItem && !transferItems.some(ti => ti.itemId === foundItem!.id)) {
            setTransferItems(prev => [...prev, {
              itemId: foundItem!.id,
              name: foundItem!.name,
              packSize: foundItem!.packSize || 1,
              trackExactQuantity: foundItem!.trackExactQuantity || false,
              currentUnits: foundItem!.currentUnits || 0,
              stockQty: foundItem!.stockLevel?.qtyOnHand || 0,
              transferType: 'packs',
              transferQty: 1,
              pharmacode: foundCodes?.pharmacode,
              gtin: foundCodes?.gtin,
            }]);
            toast({
              title: t('items.itemAdded', 'Item Added'),
              description: foundItem.name,
            });
          } else if (foundItem) {
            toast({
              title: t('items.itemAlreadyAdded', 'Item Already Added'),
              description: foundItem.name,
            });
          } else {
            toast({
              title: t('items.itemNotFound', 'Item Not Found'),
              description: t('items.noItemMatchesCode', 'No item matches this code'),
              variant: "destructive",
            });
          }
        }}
        onManualEntry={() => {
          setTransferScanner(false);
        }}
      />
      </div>
      
      {/* Desktop Webcam Capture */}
      <CameraCapture
        isOpen={webcamCaptureOpen}
        onClose={() => {
          setWebcamCaptureOpen(false);
          // If user cancels barcode scanning in step1, advance to step2 (manual entry)
          if (webcamCaptureTarget === 'codes' && addItemStage === 'step1') {
            setAddItemStage('step2');
          }
          setWebcamCaptureTarget(null);
        }}
        onCapture={handleWebcamCapture}
        fullFrame={webcamCaptureTarget !== 'codes'}
        hint={webcamCaptureTarget === 'codes' ? t('items.cameraHintGtin') : undefined}
      />

      {/* Direct Camera for streamlined Add Item workflow */}
      <DirectItemCamera
        isOpen={directCameraOpen}
        onClose={() => {
          // Cancel just closes camera - user can manually open Add dialog if needed
          setDirectCameraOpen(false);
          resetForm();
          setGalexisLookupResult(null);
        }}
        onCodesExtracted={async (codes) => {
          // Reset lookup state at start
          setGalexisLookupResult(null);
          
          // Update form data with extracted codes
          setFormData(prev => ({
            ...prev,
            gtin: codes.gtin || prev.gtin,
            pharmacode: codes.pharmacode || prev.pharmacode,
            lotNumber: codes.lotNumber || prev.lotNumber,
            expiryDate: codes.expiryDate || prev.expiryDate,
            migel: codes.migel || prev.migel,
            atc: codes.atc || prev.atc,
          }));

          // Try Galexis lookup if GTIN found
          if (codes.gtin && activeHospital?.id) {
            setIsLookingUpGalexis(true);
            try {
              const response = await apiRequest('POST', '/api/items/galexis-lookup', {
                gtin: codes.gtin,
                hospitalId: activeHospital.id,
                unitId: effectiveUnitId,
              });
              const result: any = await response.json();
              
              if (result.found) {
                setFormData(prev => ({
                  ...prev,
                  name: result.name || prev.name,
                  pharmacode: result.pharmacode || prev.pharmacode,
                  gtin: result.gtin || prev.gtin,
                  packSize: result.packSize ? String(result.packSize) : prev.packSize,
                }));
                // Store lookup result with pack size and price info for use when creating item
                setGalexisLookupResult({ 
                  found: true, 
                  source: result.source || 'galexis',
                  packSize: result.packSize,
                  basispreis: result.basispreis,
                  publikumspreis: result.publikumspreis,
                  yourPrice: result.yourPrice,
                  discountPercent: result.discountPercent,
                });
                return { galexisFound: true, productName: result.name };
              } else {
                // Explicitly set not found
                setGalexisLookupResult({ found: false, message: result.message });
              }
            } catch (error) {
              console.error('Galexis lookup failed:', error);
              setGalexisLookupResult({ found: false, message: 'Lookup failed' });
            } finally {
              setIsLookingUpGalexis(false);
            }
          }
          
          return { galexisFound: false };
        }}
        onProductInfoExtracted={(info) => {
          setFormData(prev => ({
            ...prev,
            name: info.name || prev.name,
            description: info.description || prev.description,
            packSize: info.unitsPerPack ? String(info.unitsPerPack) : prev.packSize,
          }));
        }}
        onComplete={() => {
          setDirectCameraOpen(false);
          setAddDialogOpen(true);
          setAddItemStage('manual');
        }}
      />
    </div>
  );
}
