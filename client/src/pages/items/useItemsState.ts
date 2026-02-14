import { useState, useRef } from "react";
import type { ItemWithStock, UnitType, FilterType } from "./types";
import type { Folder, Lot } from "@shared/schema";

// Edit form data shape (mirrors Items.tsx editFormData initial state)
export interface EditFormData {
  name: string;
  description: string;
  barcode: string;
  minThreshold: string;
  maxThreshold: string;
  defaultOrderQty: string;
  packSize: string;
  currentUnits: string;
  actualStock: string;
  critical: boolean;
  controlled: boolean;
  trackExactQuantity: boolean;
  imageUrl: string;
  patientPrice: string;
  dailyUsageEstimate: string;
  status: "active" | "archived";
  isInvoiceable: boolean;
  isService: boolean;
}

// Add form data shape (mirrors Items.tsx formData initial state)
export interface FormData {
  name: string;
  description: string;
  barcode: string;
  minThreshold: string;
  maxThreshold: string;
  defaultOrderQty: string;
  packSize: string;
  currentUnits: string;
  initialStock: string;
  critical: boolean;
  controlled: boolean;
  trackExactQuantity: boolean;
  isService: boolean;
  imageUrl: string;
  gtin: string;
  pharmacode: string;
  ean: string;
  supplierCode: string;
  migel: string;
  atc: string;
  manufacturer: string;
  lotNumber: string;
  expiryDate: string;
}

// Import job notification shape
export interface ImportJob {
  jobId: string;
  status: "processing" | "completed";
  itemCount: number;
  currentImage?: number;
  progressPercent?: number;
}

// License info shape
export interface LicenseInfo {
  currentCount: number;
  limit: number;
  licenseType: string;
}

// Item codes shape
export interface ItemCodes {
  gtin?: string;
  pharmacode?: string;
  migel?: string;
  atc?: string;
  manufacturer?: string;
  packContent?: string;
  unitsPerPack?: number;
  contentPerUnit?: string;
}

// Supplier code shape
export interface SupplierCode {
  id: string;
  supplierName: string;
  articleCode?: string;
  catalogUrl?: string;
  basispreis?: string;
  isPreferred: boolean;
}

// New supplier shape
export interface NewSupplier {
  supplierName: string;
  articleCode: string;
  catalogUrl: string;
  basispreis: string;
}

// Editing supplier shape
export interface EditingSupplier {
  id: string;
  supplierName: string;
  articleCode: string;
  catalogUrl: string;
  basispreis: string;
}

// Galexis lookup result shape
export interface GalexisLookupResult {
  found: boolean;
  message?: string;
  noIntegration?: boolean;
  source?: "galexis" | "hin";
  packSize?: number;
  basispreis?: number;
  publikumspreis?: number;
  yourPrice?: number;
  discountPercent?: number;
}

// Pack size confirm dialog shape
export interface PackSizeConfirmDialog {
  open: boolean;
  extractedSize: number;
  currentSize: number;
  mode: "confirm_add" | "choose_action";
}

// Name confirmation dialog shape
export interface NameConfirmDialog {
  open: boolean;
  supplierName: string;
  currentName: string;
  selectedName: "current" | "supplier";
}

// Transfer item shape
export interface TransferItem {
  itemId: string;
  name: string;
  packSize: number;
  trackExactQuantity: boolean;
  currentUnits: number;
  stockQty: number;
  transferType: "packs" | "units";
  transferQty: number;
  pharmacode?: string;
  gtin?: string;
}

// Drop indicator shape
export interface DropIndicator {
  overId: string;
  position: "above" | "below";
}

export function useItemsState() {
  // Search & filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState("name");

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saveAndCloseAdd, setSaveAndCloseAdd] = useState(true);
  const [directCameraOpen, setDirectCameraOpen] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemWithStock | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("Pack");

  // Image state
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Edit form data
  const [editFormData, setEditFormData] = useState<EditFormData>({
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
    status: "active",
    isInvoiceable: false,
    isService: false,
  });

  // Add form data
  const [formData, setFormData] = useState<FormData>({
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
    isService: false,
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

  // Refs
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
  const [bulkImportLimit, setBulkImportLimit] = useState(10);

  // CSV import state
  const [importMode, setImportMode] = useState<"select" | "image" | "csv" | "barcodes">("select");
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [bulkImportFolderId, setBulkImportFolderId] = useState<string | null>(null);

  // Import job notification state
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

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
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  // Folder state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // Drop indicator state for visual feedback
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  // Image zoom state
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [zoomImageName, setZoomImageName] = useState<string>("");

  // Edit dialog tab state
  const [editDialogTab, setEditDialogTab] = useState<string>("details");

  // Item codes and supplier codes state
  const [itemCodes, setItemCodes] = useState<ItemCodes | null>(null);
  const [supplierCodes, setSupplierCodes] = useState<SupplierCode[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [newSupplier, setNewSupplier] = useState<NewSupplier>({
    supplierName: "",
    articleCode: "",
    catalogUrl: "",
    basispreis: "",
  });
  const [editingSupplier, setEditingSupplier] = useState<EditingSupplier | null>(null);
  const [codesScanner, setCodesScanner] = useState(false);
  const [itemLots, setItemLots] = useState<Lot[]>([]);
  const [isLoadingLots, setIsLoadingLots] = useState(false);
  const [lotsScanner, setLotsScanner] = useState(false);
  const [newLot, setNewLot] = useState({ lotNumber: "", expiryDate: "" });
  const [addItemScanner, setAddItemScanner] = useState(false);

  // Wizard-style Add Item stages: step1 (barcode), step2 (product photo), manual (form fields)
  const [addItemStage, setAddItemStage] = useState<"step1" | "step2" | "manual">("step1");
  const [isAnalyzingCodes, setIsAnalyzingCodes] = useState(false);
  const [isLookingUpGalexis, setIsLookingUpGalexis] = useState(false);
  const [galexisLookupResult, setGalexisLookupResult] = useState<GalexisLookupResult | null>(null);
  const [codesImage, setCodesImage] = useState<string | null>(null);
  const codesFileInputRef = useRef<HTMLInputElement>(null);
  const codesGalleryInputRef = useRef<HTMLInputElement>(null);

  // Desktop webcam capture state
  const [webcamCaptureOpen, setWebcamCaptureOpen] = useState(false);
  const [webcamCaptureTarget, setWebcamCaptureTarget] = useState<"product" | "codes" | "editCodes" | null>(null);

  // Individual barcode scan state for Add Item codes
  const [scanningCodeField, setScanningCodeField] = useState<"gtin" | "pharmacode" | "supplierCode" | null>(null);

  // Edit Item codes capture state
  const [isAnalyzingEditCodes, setIsAnalyzingEditCodes] = useState(false);
  const [editCodesImage, setEditCodesImage] = useState<string | null>(null);
  const editCodesFileInputRef = useRef<HTMLInputElement>(null);
  const editCodesGalleryInputRef = useRef<HTMLInputElement>(null);

  // Individual barcode scan state for Edit Item codes
  const [scanningEditCodeField, setScanningEditCodeField] = useState<"gtin" | "pharmacode" | "migel" | "atc" | null>(null);

  // Edit dialog Galexis auto-lookup state
  const [isLookingUpGalexisEdit, setIsLookingUpGalexisEdit] = useState(false);
  const [galexisEditLookupMessage, setGalexisEditLookupMessage] = useState<string | null>(null);
  const galexisEditLookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pack size confirmation dialog state
  const [packSizeConfirmDialog, setPackSizeConfirmDialog] = useState<PackSizeConfirmDialog | null>(null);

  // Name confirmation dialog state (for when supplier name differs from current)
  const [nameConfirmDialog, setNameConfirmDialog] = useState<NameConfirmDialog | null>(null);

  // Transfer items dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferDirection, setTransferDirection] = useState<"to" | "from">("to");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [transferTargetUnitId, setTransferTargetUnitId] = useState<string>("");
  const [transferSearchTerm, setTransferSearchTerm] = useState("");
  const [transferScanner, setTransferScanner] = useState(false);

  return {
    // Search & filter
    searchTerm, setSearchTerm,
    activeFilter, setActiveFilter,
    sortBy, setSortBy,

    // Add dialog
    addDialogOpen, setAddDialogOpen,
    saveAndCloseAdd, setSaveAndCloseAdd,
    directCameraOpen, setDirectCameraOpen,

    // Edit dialog
    editDialogOpen, setEditDialogOpen,
    selectedItem, setSelectedItem,
    selectedUnit, setSelectedUnit,

    // Image
    uploadedImages, setUploadedImages,
    isAnalyzing, setIsAnalyzing,

    // Form data
    editFormData, setEditFormData,
    formData, setFormData,

    // Refs
    fileInputRef,
    galleryInputRef,
    editFileInputRef,
    editGalleryInputRef,
    packSizeInputRef,
    currentUnitsInputRef,
    initialStockInputRef,
    editPackSizeInputRef,
    editCurrentUnitsInputRef,
    editActualStockInputRef,
    bulkFileInputRef,
    barcodeFileInputRef,

    // Utility
    handleNumberInputFocus,

    // Bulk import
    bulkImportOpen, setBulkImportOpen,
    bulkImages, setBulkImages,
    bulkItems, setBulkItems,
    isBulkAnalyzing, setIsBulkAnalyzing,
    bulkImportLimit, setBulkImportLimit,

    // CSV import
    importMode, setImportMode,
    csvData, setCsvData,
    csvHeaders, setCsvHeaders,
    csvMapping, setCsvMapping,
    bulkImportFolderId, setBulkImportFolderId,

    // Import job
    importJob, setImportJob,

    // Bulk edit
    isBulkEditMode, setIsBulkEditMode,
    bulkEditItems, setBulkEditItems,

    // Bulk delete
    isBulkDeleteMode, setIsBulkDeleteMode,
    selectedItems, setSelectedItems,
    showDeleteConfirm, setShowDeleteConfirm,

    // Bulk move
    bulkMoveDialogOpen, setBulkMoveDialogOpen,
    bulkMoveTargetUnitId, setBulkMoveTargetUnitId,

    // Onboarding
    showOnboarding, setShowOnboarding,

    // Upgrade dialog
    upgradeDialogOpen, setUpgradeDialogOpen,
    licenseInfo, setLicenseInfo,

    // Folders
    expandedFolders, setExpandedFolders,
    folderDialogOpen, setFolderDialogOpen,
    editingFolder, setEditingFolder,
    folderName, setFolderName,
    activeItemId, setActiveItemId,

    // Drop indicator
    dropIndicator, setDropIndicator,

    // Image zoom
    zoomImageUrl, setZoomImageUrl,
    zoomImageName, setZoomImageName,

    // Edit dialog tab
    editDialogTab, setEditDialogTab,

    // Item codes & supplier codes
    itemCodes, setItemCodes,
    supplierCodes, setSupplierCodes,
    isLoadingCodes, setIsLoadingCodes,
    newSupplier, setNewSupplier,
    editingSupplier, setEditingSupplier,
    codesScanner, setCodesScanner,
    itemLots, setItemLots,
    isLoadingLots, setIsLoadingLots,
    lotsScanner, setLotsScanner,
    newLot, setNewLot,
    addItemScanner, setAddItemScanner,

    // Wizard-style Add Item stages
    addItemStage, setAddItemStage,
    isAnalyzingCodes, setIsAnalyzingCodes,
    isLookingUpGalexis, setIsLookingUpGalexis,
    galexisLookupResult, setGalexisLookupResult,
    codesImage, setCodesImage,
    codesFileInputRef,
    codesGalleryInputRef,

    // Desktop webcam capture
    webcamCaptureOpen, setWebcamCaptureOpen,
    webcamCaptureTarget, setWebcamCaptureTarget,

    // Individual barcode scan (Add Item)
    scanningCodeField, setScanningCodeField,

    // Edit Item codes capture
    isAnalyzingEditCodes, setIsAnalyzingEditCodes,
    editCodesImage, setEditCodesImage,
    editCodesFileInputRef,
    editCodesGalleryInputRef,

    // Individual barcode scan (Edit Item)
    scanningEditCodeField, setScanningEditCodeField,

    // Edit dialog Galexis auto-lookup
    isLookingUpGalexisEdit, setIsLookingUpGalexisEdit,
    galexisEditLookupMessage, setGalexisEditLookupMessage,
    galexisEditLookupTimeoutRef,

    // Pack size confirmation dialog
    packSizeConfirmDialog, setPackSizeConfirmDialog,

    // Name confirmation dialog
    nameConfirmDialog, setNameConfirmDialog,

    // Transfer items dialog
    transferDialogOpen, setTransferDialogOpen,
    transferDirection, setTransferDirection,
    transferItems, setTransferItems,
    transferTargetUnitId, setTransferTargetUnitId,
    transferSearchTerm, setTransferSearchTerm,
    transferScanner, setTransferScanner,
  };
}

// Export the return type for use by other files
export type ItemsState = ReturnType<typeof useItemsState>;
