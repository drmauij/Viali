import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/BarcodeScanner";
import { CameraCapture } from "@/components/CameraCapture";
import { isTouchDevice } from "@/pages/items/helpers";
import { 
  Check, X, ExternalLink, Package, Loader2, 
  XCircle, DollarSign, CheckCircle2, Search, ChevronRight, AlertCircle, Trash2, Star, Edit, Plus, Building2
} from "lucide-react";

interface Unit {
  id: string;
  name: string;
  hospitalId: string;
  showInventory?: boolean;
  type?: string | null;
}

interface ItemCode {
  id: string;
  itemId: string;
  gtin: string | null;
  pharmacode: string | null;
  manufacturer: string | null;
}

interface SupplierCodeInfo {
  id: string;
  supplierName: string;
  articleCode: string | null;
  matchedProductName: string | null;
  catalogUrl: string | null;
  matchConfidence: string | null;
  matchReason: string | null;
  basispreis: string | null;
  publikumspreis?: string | null;
  lastPriceUpdate?: string | null;
}

interface CategorizedItem {
  id: string;
  name: string;
  description: string | null;
  itemCode: ItemCode | null;
  supplierCodes: any[];
  confirmedMatch?: SupplierCodeInfo;
}

interface CategorizedData {
  unmatched: CategorizedItem[];
  confirmedWithPrice: CategorizedItem[];
  confirmedNoPrice: CategorizedItem[];
  counts: {
    unmatched: number;
    confirmedWithPrice: number;
    confirmedNoPrice: number;
    total: number;
  };
}

// Helper to display item codes inline
function ItemCodesDisplay({ itemCode }: { itemCode: ItemCode | null }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {itemCode?.pharmacode && (
        <span>Pharmacode: {itemCode.pharmacode}</span>
      )}
      {itemCode?.gtin && (
        <span>GTIN: {itemCode.gtin}</span>
      )}
      {!itemCode?.pharmacode && !itemCode?.gtin && (
        <span className="italic">No codes</span>
      )}
    </div>
  );
}

interface SupplierMatchesProps {
  overrideUnitId?: string;
}

export default function SupplierMatches({ overrideUnitId }: SupplierMatchesProps = {}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  
  // Search states for each tab
  const [searchUnmatched, setSearchUnmatched] = useState("");
  const [searchWithPrice, setSearchWithPrice] = useState("");
  const [searchNoPrice, setSearchNoPrice] = useState("");
  
  // Edit Codes dialog state
  const [editCodesOpen, setEditCodesOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategorizedItem | null>(null);
  const [editingItemCodes, setEditingItemCodes] = useState<{ gtin?: string; pharmacode?: string; migel?: string; atc?: string; manufacturer?: string } | null>(null);
  const [editingSupplierCodes, setEditingSupplierCodes] = useState<SupplierCodeInfo[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [codesImage, setCodesImage] = useState<string | null>(null);
  const [scanningCodeField, setScanningCodeField] = useState<'gtin' | 'pharmacode' | 'migel' | 'atc' | null>(null);
  
  // Supplier management state
  const [editingSupplierCode, setEditingSupplierCode] = useState<{
    id: string;
    supplierName: string;
    articleCode: string;
    catalogUrl: string;
    basispreis: string;
  } | null>(null);
  const [newSupplierCode, setNewSupplierCode] = useState({
    supplierName: "",
    articleCode: "",
    catalogUrl: "",
    basispreis: ""
  });
  
  // Galexis/HIN lookup state
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Name confirmation dialog state
  const [nameConfirmDialog, setNameConfirmDialog] = useState<{
    open: boolean;
    supplierName: string;
    currentName: string;
    itemId: string;
    selectedName: 'current' | 'supplier';
  } | null>(null);
  
  // File input refs for photo capture
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  
  // Webcam capture state for desktop
  const [webcamCaptureOpen, setWebcamCaptureOpen] = useState(false);
  
  // Unit filter state (for logistics module cross-unit access)
  const [filterUnitId, setFilterUnitId] = useState<string>("current");
  
  // Check if user has logistics module access (but hide unit selector if overrideUnitId is provided)
  const isLogisticModule = activeHospital?.unitType === 'logistic' && !overrideUnitId;
  
  // Fetch all units for this hospital (only for logistics module users)
  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: [`/api/units/${activeHospital?.id}`],
    enabled: isLogisticModule && !!activeHospital?.id,
  });
  
  // Filter to only units with inventory module enabled
  const inventoryUnits = useMemo(() => {
    return allUnits.filter(unit => unit.showInventory !== false);
  }, [allUnits]);
  
  // Determine which unitId to use for API calls
  const effectiveUnitId = useMemo(() => {
    // If overrideUnitId is provided (from LogisticMatches), use it directly
    if (overrideUnitId) {
      return overrideUnitId;
    }
    if (!isLogisticModule || filterUnitId === "current") {
      return activeHospital?.unitId;
    }
    return filterUnitId;
  }, [overrideUnitId, isLogisticModule, filterUnitId, activeHospital?.unitId]);
  
  // Open Edit Codes dialog for an item
  const openItemCodesEditor = async (itemId: string) => {
    // Find the item from the categorized data
    const allItems = [
      ...(categorizedData?.unmatched || []),
      ...(categorizedData?.confirmedWithPrice || []),
      ...(categorizedData?.confirmedNoPrice || []),
    ];
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    setEditingItem(item);
    setEditingItemCodes({ gtin: "", pharmacode: "", migel: "", atc: "", manufacturer: "" });
    setCodesImage(null);
    setEditCodesOpen(true);
    
    // Load additional codes data
    setIsLoadingCodes(true);
    try {
      const [codesRes, suppliersRes] = await Promise.all([
        fetch(`/api/items/${itemId}/codes`, { credentials: "include" }),
        fetch(`/api/items/${itemId}/suppliers`, { credentials: "include" }),
      ]);
      if (codesRes.ok) {
        const codes = await codesRes.json();
        if (codes) {
          setEditingItemCodes({ 
            gtin: codes.gtin || "", 
            pharmacode: codes.pharmacode || "",
            migel: codes.migel || "",
            atc: codes.atc || "",
            manufacturer: codes.manufacturer || ""
          });
        }
      }
      if (suppliersRes.ok) {
        const suppliers = await suppliersRes.json();
        setEditingSupplierCodes(suppliers || []);
      }
    } catch (err) {
      console.error('Failed to load codes:', err);
    } finally {
      setIsLoadingCodes(false);
    }
  };
  
  const handleSaveCodes = async () => {
    if (!editingItem || !editingItemCodes) return;
    
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/items/${editingItem.id}/codes`, editingItemCodes);
      toast({ title: t("common.success"), description: t("items.codesUpdated", "Codes updated successfully") });
      refetch();
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCloseEditCodes = () => {
    setEditCodesOpen(false);
    setEditingItem(null);
    setEditingItemCodes(null);
    setEditingSupplierCodes([]);
    setCodesImage(null);
    setEditingSupplierCode(null);
    setNewSupplierCode({ supplierName: "", articleCode: "", catalogUrl: "", basispreis: "" });
    setIsLookingUp(false);
    setLookupMessage(null);
    if (lookupTimeoutRef.current) {
      clearTimeout(lookupTimeoutRef.current);
    }
  };
  
  // Refresh supplier codes for the current item
  const refreshSupplierCodes = async () => {
    if (!editingItem) return;
    try {
      const res = await fetch(`/api/items/${editingItem.id}/suppliers`, { credentials: "include" });
      if (res.ok) {
        const suppliers = await res.json();
        setEditingSupplierCodes(suppliers || []);
      }
    } catch (err) {
      console.error('Failed to refresh suppliers:', err);
    }
  };
  
  // Galexis/HIN product lookup for Edit Codes dialog
  const lookupProduct = async (gtin?: string, pharmacode?: string) => {
    if ((!gtin && !pharmacode) || !activeHospital?.id || !editingItem) return;
    
    setIsLookingUp(true);
    setLookupMessage(t('items.lookingUpGalexis', 'Looking up in Galexis/HIN...'));
    
    try {
      const response = await apiRequest('POST', '/api/items/galexis-lookup', {
        gtin: gtin || undefined,
        pharmacode: pharmacode || undefined,
        hospitalId: activeHospital.id,
        unitId: activeHospital.unitId,
      });
      const result: any = await response.json();
      
      // Check if item with same code already exists in this unit
      if (result.existingItem && result.existingItem.itemId !== editingItem.id) {
        toast({
          title: t('items.duplicateCodeFound', 'Duplicate Code Found'),
          description: t('items.duplicateCodeDesc', `An item "${result.existingItem.itemName}" already has this code`),
          variant: "destructive",
        });
        setLookupMessage(t('items.duplicateCodeExists', `Item "${result.existingItem.itemName}" already has this code`));
        return;
      }
      
      if (result.found) {
        // Handle GTIN: fill if empty
        const returnedGtin = result.gtin;
        const currentGtin = editingItemCodes?.gtin;
        
        if (returnedGtin && !currentGtin) {
          setEditingItemCodes(prev => prev ? { ...prev, gtin: returnedGtin } : { gtin: returnedGtin });
          toast({
            title: t('items.gtinAutoFilled', 'GTIN Auto-filled'),
            description: `GTIN: ${returnedGtin}`,
          });
        }
        
        // Update manufacturer if found
        if (result.manufacturer) {
          setEditingItemCodes(prev => prev ? { ...prev, manufacturer: result.manufacturer } : { manufacturer: result.manufacturer });
        }
        
        // Check if supplier with same code already exists for this item
        const existingSupplier = editingSupplierCodes.find(
          s => s.articleCode === (result.pharmacode || pharmacode)
        );
        if (existingSupplier) {
          setLookupMessage(t('items.supplierAlreadyExists', `${existingSupplier.supplierName} supplier already exists with this code`));
          return;
        }
        
        // Auto-add supplier with Galexis/HIN data
        const priceValue = result.yourPrice || result.basispreis;
        const supplierData = {
          supplierName: result.supplierName || (result.source === 'hin' ? 'HIN' : 'Galexis'),
          articleCode: result.pharmacode || pharmacode || null,
          catalogUrl: result.catalogUrl || null,
          basispreis: priceValue ? String(priceValue) : null,
          isPreferred: editingSupplierCodes.length === 0,
        };
        
        try {
          const createRes = await apiRequest("POST", `/api/items/${editingItem.id}/suppliers`, supplierData);
          const created = await createRes.json();
          setEditingSupplierCodes(prev => [...prev, created]);
          
          setLookupMessage(t('items.supplierAddedFromLookup', `${supplierData.supplierName} supplier added with price ${priceValue ? priceValue + ' CHF' : 'N/A'}`));
          
          // Check if supplier name differs from current item name
          if (result.name && editingItem.name) {
            const supplierNameNormalized = result.name.trim().toLowerCase();
            const currentNameNormalized = editingItem.name.trim().toLowerCase();
            
            if (supplierNameNormalized !== currentNameNormalized) {
              // Names are different - show confirmation dialog
              setNameConfirmDialog({
                open: true,
                supplierName: result.name,
                currentName: editingItem.name,
                itemId: editingItem.id,
                selectedName: 'current',
              });
            }
          }
          
          // Invalidate supplier matches cache to move item out of unmatched
          queryClient.invalidateQueries({ queryKey: ['/api/inventory/supplier-matches', activeHospital.id] });
        } catch (addErr: any) {
          console.error('Failed to add supplier:', addErr);
          setLookupMessage(t('items.lookupFoundButAddFailed', 'Product found but failed to add supplier'));
        }
      } else {
        setLookupMessage(t('items.productNotFound', 'Product not found in Galexis/HIN'));
      }
    } catch (err: any) {
      console.error('Lookup failed:', err);
      setLookupMessage(t('items.lookupFailed', 'Lookup failed: ') + (err.message || 'Unknown error'));
    } finally {
      setIsLookingUp(false);
    }
  };
  
  // Auto-trigger lookup when GTIN or Pharmacode changes in Edit Codes dialog
  useEffect(() => {
    if (!editCodesOpen || !editingItem) return;
    
    const gtin = editingItemCodes?.gtin?.trim();
    const pharmacode = editingItemCodes?.pharmacode?.trim();
    
    // Only lookup if we have a code and no suppliers yet
    if (!gtin && !pharmacode) return;
    if (isLookingUp) return;
    
    // Debounce the lookup
    if (lookupTimeoutRef.current) {
      clearTimeout(lookupTimeoutRef.current);
    }
    
    lookupTimeoutRef.current = setTimeout(() => {
      lookupProduct(gtin, pharmacode);
    }, 800);
    
    return () => {
      if (lookupTimeoutRef.current) {
        clearTimeout(lookupTimeoutRef.current);
      }
    };
  }, [editingItemCodes?.gtin, editingItemCodes?.pharmacode, editCodesOpen, editingItem?.id]);
  
  // Handle image upload for AI Vision OCR analysis
  const handleCodesImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsAnalyzingPhoto(true);
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setCodesImage(base64);
      
      try {
        const response = await apiRequest("POST", "/api/items/analyze-codes", { image: base64 });
        const result = await response.json();
        
        if (result.codes) {
          setEditingItemCodes(prev => {
            const current = prev ?? { gtin: "", pharmacode: "", migel: "", atc: "", manufacturer: "" };
            return {
              ...current,
              gtin: result.codes.gtin || current.gtin || "",
              pharmacode: result.codes.pharmacode || current.pharmacode || "",
              migel: result.codes.migel || current.migel || "",
              atc: result.codes.atc || current.atc || "",
              manufacturer: result.codes.manufacturer || current.manufacturer || "",
            };
          });
          toast({ title: t("common.success"), description: t("items.codesExtracted", "Codes extracted from image") });
        }
      } catch (err: any) {
        console.error("Failed to analyze image:", err);
        toast({ title: t("common.error"), description: err.message || "Failed to analyze image", variant: "destructive" });
      } finally {
        setIsAnalyzingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    event.target.value = "";
  };
  
  // Handle webcam photo capture (for desktop)
  const handleWebcamCapture = async (photo: string) => {
    setWebcamCaptureOpen(false);
    setIsAnalyzingPhoto(true);
    setCodesImage(photo);
    
    try {
      const response = await apiRequest("POST", "/api/items/analyze-codes", { image: photo });
      const result = await response.json();
      
      if (result.codes) {
        setEditingItemCodes(prev => {
          const current = prev ?? { gtin: "", pharmacode: "", migel: "", atc: "", manufacturer: "" };
          return {
            ...current,
            gtin: result.codes.gtin || current.gtin || "",
            pharmacode: result.codes.pharmacode || current.pharmacode || "",
            migel: result.codes.migel || current.migel || "",
            atc: result.codes.atc || current.atc || "",
            manufacturer: result.codes.manufacturer || current.manufacturer || "",
          };
        });
        toast({ title: t("common.success"), description: t("items.codesExtracted", "Codes extracted from image") });
      }
    } catch (err: any) {
      console.error("Failed to analyze webcam image:", err);
      toast({ title: t("common.error"), description: err.message || "Failed to analyze image", variant: "destructive" });
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };
  
  // Open webcam or file input based on device type
  const handleTakePhoto = () => {
    if (isTouchDevice()) {
      // Mobile/tablet: use native file input with camera capture
      cameraInputRef.current?.click();
    } else {
      // Desktop: use webcam capture component
      setWebcamCaptureOpen(true);
    }
  };
  
  // Handle barcode scan result
  const handleCodeScan = (code: string) => {
    if (!scanningCodeField) return;
    
    setEditingItemCodes(prev => ({
      ...prev,
      [scanningCodeField]: code
    }));
    
    toast({ 
      title: t("items.codeScanned", "Code Scanned"), 
      description: `${scanningCodeField.toUpperCase()}: ${code}` 
    });
    setScanningCodeField(null);
  };
  
  // Filter function for items
  const filterItems = (items: CategorizedItem[], searchQuery: string) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter(item => 
      item.name.toLowerCase().includes(query) ||
      (item.description?.toLowerCase() || "").includes(query) ||
      (item.itemCode?.pharmacode?.toLowerCase() || "").includes(query) ||
      (item.itemCode?.gtin?.toLowerCase() || "").includes(query)
    );
  };

  const { data: categorizedData, isLoading, refetch } = useQuery<CategorizedData>({
    queryKey: [`/api/supplier-matches/${activeHospital?.id}/categorized`, effectiveUnitId],
    queryFn: async () => {
      const url = effectiveUnitId 
        ? `/api/supplier-matches/${activeHospital?.id}/categorized?unitId=${effectiveUnitId}`
        : `/api/supplier-matches/${activeHospital?.id}/categorized`;
      const res = await fetch(url, { 
        credentials: 'include',
        headers: {
          'x-active-unit-id': activeHospital?.unitId || '',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!activeHospital?.id && !!effectiveUnitId,
  });

  const confirmMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("common.success"), description: t("supplierMatches.matchConfirmed") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const rejectMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("common.success"), description: t("supplierMatches.matchRejected") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  // HIN matches query for the "To Verify" tab
  interface HinMatchData {
    matched: any[];
    toVerify: any[];
    unmatched: any[];
    rejected: any[];
    counts: {
      matched: number;
      toVerify: number;
      unmatched: number;
      rejected: number;
      total: number;
    };
  }
  
  const { data: hinMatchData, refetch: refetchHinMatches, isLoading: isLoadingHin } = useQuery<HinMatchData>({
    queryKey: [`/api/hin-matches/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const [isSyncingHin, setIsSyncingHin] = useState(false);
  const [searchToVerify, setSearchToVerify] = useState("");
  
  // Trigger HIN batch sync
  const syncWithHin = async () => {
    if (!activeHospital?.id) return;
    setIsSyncingHin(true);
    try {
      const response = await apiRequest("POST", `/api/hin-matches/${activeHospital.id}/sync`);
      const result = await response.json();
      toast({
        title: t("hinMatches.syncComplete", "HIN Sync Complete"),
        description: t("hinMatches.syncResults", `Matched: ${result.matched}, To Verify: ${result.toVerify}, Unmatched: ${result.unmatched}`),
      });
      refetchHinMatches();
      refetch();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("hinMatches.syncFailed", "Failed to sync with HIN"),
        variant: "destructive",
      });
    } finally {
      setIsSyncingHin(false);
    }
  };

  // Approve HIN fuzzy match
  const approveHinMatch = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/hin-matches/${matchId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      refetchHinMatches();
      refetch();
      toast({ title: t("common.success"), description: t("hinMatches.matchApproved", "Match approved and codes updated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  // Reject HIN fuzzy match
  const rejectHinMatch = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/hin-matches/${matchId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      refetchHinMatches();
      toast({ title: t("common.success"), description: t("hinMatches.matchRejected", "Match rejected") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });
  
  // Filter HIN matches by search
  const filterHinMatches = (matches: any[], search: string) => {
    if (!search.trim()) return matches;
    const lower = search.toLowerCase();
    return matches.filter(m => 
      m.itemName?.toLowerCase().includes(lower) ||
      m.hinDescriptionDe?.toLowerCase().includes(lower) ||
      m.originalPharmacode?.includes(search) ||
      m.hinPharmacode?.includes(search)
    );
  };

  const formatPrice = (price: string | null) => {
    if (!price) return "-";
    return `CHF ${parseFloat(price).toFixed(2)}`;
  };

  const getConfidenceBadge = (confidence: string | number | null | undefined) => {
    if (confidence == null) return null;
    const conf = typeof confidence === 'number' ? confidence : parseFloat(String(confidence));
    if (isNaN(conf)) return null;
    if (conf >= 0.9) {
      return <Badge variant="default" className="bg-green-600 text-xs">{Math.round(conf * 100)}%</Badge>;
    } else if (conf >= 0.7) {
      return <Badge variant="secondary" className="text-xs">{Math.round(conf * 100)}%</Badge>;
    } else {
      return <Badge variant="outline" className="text-xs">{Math.round(conf * 100)}%</Badge>;
    }
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("supplierMatches.noHospitalSelected")}</h3>
          <p className="text-muted-foreground">{t("supplierMatches.selectHospitalFirst")}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{t("supplierMatches.title")}</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const counts = categorizedData?.counts || { unmatched: 0, confirmedWithPrice: 0, confirmedNoPrice: 0, total: 0 };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("supplierMatches.title", "Supplier Matches")}</h1>
        <Badge variant="outline" className="text-sm">
          {counts.total} {t("supplierMatches.totalItems", "items")}
        </Badge>
      </div>

      {/* Unit selector for logistics module users */}
      {isLogisticModule && inventoryUnits.length > 0 && (
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <Select value={filterUnitId} onValueChange={setFilterUnitId}>
            <SelectTrigger className="w-[200px] h-9" data-testid="select-unit-filter">
              <SelectValue placeholder={t("common.selectUnit", "Select unit...")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current" data-testid="unit-filter-current">
                {t("common.currentUnit", "Current Unit")} ({activeHospital?.unitName})
              </SelectItem>
              {inventoryUnits.map((unit) => (
                <SelectItem key={unit.id} value={unit.id} data-testid={`unit-filter-${unit.id}`}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterUnitId !== "current" && (
            <Badge variant="secondary" className="text-xs">
              {inventoryUnits.find(u => u.id === filterUnitId)?.name || ""}
            </Badge>
          )}
        </div>
      )}

      <Tabs defaultValue="unmatched" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto gap-0.5">
          <TabsTrigger value="unmatched" data-testid="tab-unmatched" className="text-[10px] sm:text-sm px-1 sm:px-3 py-2 flex-col sm:flex-row gap-0.5 sm:gap-1">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-tight">
              <span className="hidden sm:inline">{t("supplierMatches.unmatched", "Unmatched")}</span>
              <span className="sm:hidden">None</span>
              <span className="block sm:inline text-[9px] sm:text-xs opacity-80"> ({counts.unmatched})</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="toVerify" data-testid="tab-to-verify" className="text-[10px] sm:text-sm px-1 sm:px-3 py-2 flex-col sm:flex-row gap-0.5 sm:gap-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-tight">
              <span className="hidden sm:inline">{t("hinMatches.toVerify", "To Verify")}</span>
              <span className="sm:hidden">Check</span>
              <span className="block sm:inline text-[9px] sm:text-xs opacity-80"> ({hinMatchData?.counts?.toVerify || 0})</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="confirmedNoPrice" data-testid="tab-confirmed-no-price" className="text-[10px] sm:text-sm px-1 sm:px-3 py-2 flex-col sm:flex-row gap-0.5 sm:gap-1">
            <DollarSign className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-tight">
              <span className="hidden sm:inline">{t("supplierMatches.confirmedNoPrice", "No Price")}</span>
              <span className="sm:hidden">No $</span>
              <span className="block sm:inline text-[9px] sm:text-xs opacity-80"> ({counts.confirmedNoPrice})</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="confirmedWithPrice" data-testid="tab-confirmed-price" className="text-[10px] sm:text-sm px-1 sm:px-3 py-2 flex-col sm:flex-row gap-0.5 sm:gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-tight">
              <span className="hidden sm:inline">{t("supplierMatches.confirmedWithPrice", "With Price")}</span>
              <span className="sm:hidden">OK $</span>
              <span className="block sm:inline text-[9px] sm:text-xs opacity-80"> ({counts.confirmedWithPrice})</span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unmatched" className="space-y-3 mt-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="text-amber-700 dark:text-amber-300">
              {t("supplierMatches.unmatchedDesc", "Items without any supplier match. Add pharmacode/GTIN manually or run a sync.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchUnmatched}
              onChange={(e) => setSearchUnmatched(e.target.value)}
              className="pl-9"
              data-testid="input-search-unmatched"
            />
          </div>
          {filterItems(categorizedData?.unmatched || [], searchUnmatched).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchUnmatched.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.allItemsMatched", "All items have supplier matches!")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.unmatched || [], searchUnmatched).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-unmatched-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <ItemCodesDisplay itemCode={item.itemCode} />
                    </div>
                    <Badge variant="outline" className="text-red-600 border-red-300 shrink-0">
                      {t("supplierMatches.noMatch", "No Match")}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* To Verify Tab - HIN fuzzy matches requiring manual confirmation */}
        <TabsContent value="toVerify" className="space-y-3 mt-4">
          <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-purple-700 dark:text-purple-300">
                {t("hinMatches.toVerifyDesc", "Items matched by name similarity to HIN database. Review each match and approve or reject.")}
              </p>
              <Button 
                size="sm"
                variant="outline"
                onClick={syncWithHin}
                disabled={isSyncingHin}
                data-testid="button-sync-hin"
              >
                {isSyncingHin ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("hinMatches.syncing", "Syncing...")}</>
                ) : (
                  <>{t("hinMatches.syncWithHin", "Sync with HIN")}</>
                )}
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchToVerify}
              onChange={(e) => setSearchToVerify(e.target.value)}
              className="pl-9"
              data-testid="input-search-to-verify"
            />
          </div>
          
          {isLoadingHin ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : filterHinMatches(hinMatchData?.toVerify || [], searchToVerify).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchToVerify.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground">{t("hinMatches.noItemsToVerify", "No items need verification. Click 'Sync with HIN' to find matches.")}</p>
                </>
              )}
            </div>
          ) : (
            filterHinMatches(hinMatchData?.toVerify || [], searchToVerify).map((match) => (
              <Card 
                key={match.id} 
                data-testid={`card-to-verify-${match.id}`}
                className="border-purple-200 dark:border-purple-800"
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Your Item */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{t("hinMatches.yourItem", "Your Item")}</Badge>
                          {getConfidenceBadge(match.matchConfidence)}
                        </div>
                        <h3 className="font-semibold text-foreground">{match.itemName}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {match.originalPharmacode && <span>Pharmacode: {match.originalPharmacode}</span>}
                          {match.originalGtin && <span>GTIN: {match.originalGtin}</span>}
                          {!match.originalPharmacode && !match.originalGtin && <span className="italic">{t("hinMatches.noCodes", "No codes")}</span>}
                        </div>
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center justify-center">
                      <ChevronRight className="w-5 h-5 text-muted-foreground rotate-90" />
                    </div>
                    
                    {/* HIN Match */}
                    <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{t("hinMatches.hinMatch", "HIN Match")}</Badge>
                        </div>
                        <h3 className="font-medium text-foreground">{match.hinDescriptionDe}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {match.hinPharmacode && <span>Pharmacode: {match.hinPharmacode}</span>}
                          {match.hinGtin && <span>GTIN: {match.hinGtin}</span>}
                          {match.hinSmcat && <span className="text-blue-600">Cat. {match.hinSmcat}</span>}
                        </div>
                        {(match.hinPexf || match.hinPpub) && (
                          <div className="flex items-center gap-3 text-sm mt-2">
                            {match.hinPexf && <span className="font-medium text-green-600">PEXF: CHF {parseFloat(String(match.hinPexf)).toFixed(2)}</span>}
                            {match.hinPpub && <span className="text-muted-foreground">PPUB: CHF {parseFloat(String(match.hinPpub)).toFixed(2)}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Match reason */}
                    {match.matchReason && (
                      <p className="text-xs text-muted-foreground italic">{match.matchReason}</p>
                    )}
                    
                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectHinMatch.mutate(match.id)}
                        disabled={rejectHinMatch.isPending}
                        data-testid={`button-reject-${match.id}`}
                      >
                        <X className="w-4 h-4 mr-1" />
                        {t("common.reject", "Reject")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approveHinMatch.mutate(match.id)}
                        disabled={approveHinMatch.isPending}
                        data-testid={`button-approve-${match.id}`}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        {t("common.approve", "Approve")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="confirmedWithPrice" className="space-y-3 mt-4">
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
            <p className="text-green-700 dark:text-green-300">
              {t("supplierMatches.confirmedWithPriceDesc", "Items with confirmed supplier match and price from Galexis.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchWithPrice}
              onChange={(e) => setSearchWithPrice(e.target.value)}
              className="pl-9"
              data-testid="input-search-with-price"
            />
          </div>
          {filterItems(categorizedData?.confirmedWithPrice || [], searchWithPrice).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchWithPrice.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <DollarSign className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.noConfirmedWithPrice", "No confirmed items with prices yet")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.confirmedWithPrice || [], searchWithPrice).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-confirmed-price-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <ItemCodesDisplay itemCode={item.itemCode} />
                      {item.confirmedMatch && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{item.confirmedMatch.supplierName}</Badge>
                          {item.confirmedMatch.articleCode && (
                            <span>Art. {item.confirmedMatch.articleCode}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-lg font-bold text-green-600 shrink-0">
                      {formatPrice(item.confirmedMatch?.basispreis || null)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="confirmedNoPrice" className="space-y-3 mt-4">
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-sm">
            <p className="text-orange-700 dark:text-orange-300">
              {t("supplierMatches.confirmedNoPriceDesc", "Items with confirmed pharmacode/GTIN but no price from Galexis. These need manual price entry or are not available in Galexis catalog.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchNoPrice}
              onChange={(e) => setSearchNoPrice(e.target.value)}
              className="pl-9"
              data-testid="input-search-no-price"
            />
          </div>
          {filterItems(categorizedData?.confirmedNoPrice || [], searchNoPrice).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchNoPrice.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.allHavePrices", "All confirmed items have prices!")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.confirmedNoPrice || [], searchNoPrice).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-confirmed-no-price-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <ItemCodesDisplay itemCode={item.itemCode} />
                      {item.confirmedMatch && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{item.confirmedMatch.supplierName}</Badge>
                          {item.confirmedMatch.articleCode && (
                            <span>Art. {item.confirmedMatch.articleCode}</span>
                          )}
                          <span className="text-orange-600">{t("supplierMatches.priceNotInGalexis", "Not in Galexis")}</span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-300 shrink-0">
                      {t("supplierMatches.needsPrice", "Needs Price")}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Codes Dialog */}
      <Dialog open={editCodesOpen} onOpenChange={(open) => { if (!open) handleCloseEditCodes(); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {/* Fixed Header */}
          <div className="flex-shrink-0 bg-background z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">{t('items.editCodes', 'Edit Codes')}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm truncate">
                {editingItem?.name}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {/* Hidden file inputs for photo capture */}
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleCodesImageUpload}
            className="hidden"
          />
          <input
            type="file"
            ref={galleryInputRef}
            accept="image/*"
            onChange={handleCodesImageUpload}
            className="hidden"
          />
          
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pt-2 pb-4 min-h-0 space-y-6">
            {isLoadingCodes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Universal Product Codes Section */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-barcode text-primary"></i>
                      <h3 className="font-semibold text-sm sm:text-base">{t('items.universalCodes', 'Universal Codes')}</h3>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTakePhoto}
                        disabled={isAnalyzingPhoto}
                        className="text-xs px-2 sm:px-3"
                        data-testid="button-edit-camera-codes"
                      >
                        <i className={`fas ${isAnalyzingPhoto ? 'fa-spinner fa-spin' : 'fa-camera'} sm:mr-1`}></i>
                        <span className="hidden sm:inline">{isAnalyzingPhoto ? t('items.analyzing', 'Analyzing...') : t('controlled.takePhoto', 'Take Photo')}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={isAnalyzingPhoto}
                        className="text-xs px-2 sm:px-3"
                        data-testid="button-edit-gallery-codes"
                      >
                        <i className="fas fa-images sm:mr-1"></i>
                        <span className="hidden sm:inline">{t('items.uploadFromGallery', 'Gallery')}</span>
                      </Button>
                    </div>
                  </div>
                  {codesImage && (
                    <div className="flex items-center gap-2">
                      <img src={codesImage} alt="Codes" className="h-12 w-12 object-cover rounded border" />
                      <span className="text-xs text-muted-foreground">{t('items.photoAnalyzed', 'Photo analyzed')}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-gtin">GTIN/EAN</Label>
                      <div className="flex gap-1">
                        <Input 
                          id="edit-gtin"
                          placeholder="e.g., 7680123456789"
                          value={editingItemCodes?.gtin || ""}
                          onChange={(e) => setEditingItemCodes(prev => prev ? { ...prev, gtin: e.target.value } : { gtin: e.target.value })}
                          data-testid="input-edit-gtin"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0"
                          onClick={() => setScanningCodeField('gtin')}
                          data-testid="button-scan-edit-gtin"
                        >
                          <i className="fas fa-barcode text-xs"></i>
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="edit-pharmacode">Pharmacode</Label>
                      <div className="flex gap-1">
                        <Input 
                          id="edit-pharmacode"
                          placeholder="7-digit Swiss code"
                          value={editingItemCodes?.pharmacode || ""}
                          onChange={(e) => setEditingItemCodes(prev => prev ? { ...prev, pharmacode: e.target.value } : { pharmacode: e.target.value })}
                          data-testid="input-edit-pharmacode"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0"
                          onClick={() => setScanningCodeField('pharmacode')}
                          data-testid="button-scan-edit-pharmacode"
                        >
                          <i className="fas fa-barcode text-xs"></i>
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="edit-migel">MiGeL Code</Label>
                      <div className="flex gap-1">
                        <Input 
                          id="edit-migel"
                          placeholder="Swiss device code"
                          value={editingItemCodes?.migel || ""}
                          onChange={(e) => setEditingItemCodes(prev => prev ? { ...prev, migel: e.target.value } : { migel: e.target.value })}
                          data-testid="input-edit-migel"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0"
                          onClick={() => setScanningCodeField('migel')}
                          data-testid="button-scan-edit-migel"
                        >
                          <i className="fas fa-barcode text-xs"></i>
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="edit-atc">ATC Code</Label>
                      <div className="flex gap-1">
                        <Input 
                          id="edit-atc"
                          placeholder="e.g., N02BE01"
                          value={editingItemCodes?.atc || ""}
                          onChange={(e) => setEditingItemCodes(prev => prev ? { ...prev, atc: e.target.value } : { atc: e.target.value })}
                          data-testid="input-edit-atc"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0"
                          onClick={() => setScanningCodeField('atc')}
                          data-testid="button-scan-edit-atc"
                        >
                          <i className="fas fa-barcode text-xs"></i>
                        </Button>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-manufacturer">Manufacturer</Label>
                      <Input 
                        id="edit-manufacturer"
                        placeholder="e.g., B. Braun, 3M"
                        value={editingItemCodes?.manufacturer || ""}
                        onChange={(e) => setEditingItemCodes(prev => prev ? { ...prev, manufacturer: e.target.value } : { manufacturer: e.target.value })}
                        data-testid="input-edit-manufacturer"
                      />
                    </div>
                  </div>
                </div>

                {/* Galexis/HIN Lookup Status */}
                {(isLookingUp || lookupMessage) && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${isLookingUp ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : lookupMessage?.includes('not found') || lookupMessage?.includes('failed') ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'}`} data-testid="lookup-status">
                    {isLookingUp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('items.lookingUpGalexis', 'Looking up in Galexis/HIN...')}</span>
                      </>
                    ) : (
                      <>
                        <i className={`fas ${lookupMessage?.includes('not found') || lookupMessage?.includes('failed') ? 'fa-info-circle' : 'fa-check-circle'}`}></i>
                        <span>{lookupMessage}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Supplier Pricing Section */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-truck text-primary"></i>
                      <h3 className="font-semibold">{t('items.supplierPricing', 'Supplier Pricing')}</h3>
                    </div>
                  </div>
                  
                  {/* Existing Suppliers List */}
                  {editingSupplierCodes.length > 0 && (
                    <div className="space-y-2">
                      {editingSupplierCodes.map((supplier) => (
                        <div 
                          key={supplier.id}
                          className="p-3 rounded-lg border border-border"
                          data-testid={`supplier-${supplier.id}`}
                        >
                          {editingSupplierCode?.id === supplier.id ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Supplier name *"
                                  value={editingSupplierCode.supplierName}
                                  onChange={(e) => setEditingSupplierCode(prev => prev ? { ...prev, supplierName: e.target.value } : null)}
                                  data-testid="input-edit-supplier-name"
                                />
                                <Input
                                  placeholder="Article code"
                                  value={editingSupplierCode.articleCode}
                                  onChange={(e) => setEditingSupplierCode(prev => prev ? { ...prev, articleCode: e.target.value } : null)}
                                  data-testid="input-edit-supplier-article"
                                />
                                <Input
                                  placeholder="Catalog URL"
                                  value={editingSupplierCode.catalogUrl}
                                  onChange={(e) => setEditingSupplierCode(prev => prev ? { ...prev, catalogUrl: e.target.value } : null)}
                                  data-testid="input-edit-supplier-url"
                                />
                                <Input
                                  placeholder="Price (CHF)"
                                  type="number"
                                  step="0.01"
                                  value={editingSupplierCode.basispreis}
                                  onChange={(e) => setEditingSupplierCode(prev => prev ? { ...prev, basispreis: e.target.value } : null)}
                                  data-testid="input-edit-supplier-price"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingSupplierCode(null)}
                                  data-testid="button-cancel-edit-supplier"
                                >
                                  {t('common.cancel')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!editingSupplierCode.supplierName}
                                  onClick={async () => {
                                    if (!editingItem || !editingSupplierCode.supplierName) return;
                                    try {
                                      await apiRequest("PUT", `/api/items/${editingItem.id}/suppliers/${editingSupplierCode.id}`, {
                                        supplierName: editingSupplierCode.supplierName,
                                        articleCode: editingSupplierCode.articleCode || null,
                                        catalogUrl: editingSupplierCode.catalogUrl || null,
                                        basispreis: editingSupplierCode.basispreis || null,
                                      });
                                      await refreshSupplierCodes();
                                      setEditingSupplierCode(null);
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
                                  {supplier.matchConfidence && (
                                    <Badge variant={supplier.matchConfidence === 'verified' ? 'default' : 'outline'} className="text-xs">
                                      {supplier.matchConfidence === 'verified' ? 'Verified' : `${Math.round(parseFloat(supplier.matchConfidence) * 100)}%`}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground space-x-3">
                                  {supplier.articleCode && <span>Art: {supplier.articleCode}</span>}
                                  {supplier.basispreis && <span>CHF {supplier.basispreis}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {supplier.catalogUrl && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(supplier.catalogUrl!, '_blank')}
                                    data-testid={`link-catalog-${supplier.id}`}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingSupplierCode({
                                    id: supplier.id,
                                    supplierName: supplier.supplierName,
                                    articleCode: supplier.articleCode || '',
                                    catalogUrl: supplier.catalogUrl || '',
                                    basispreis: supplier.basispreis || '',
                                  })}
                                  data-testid={`button-edit-supplier-${supplier.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    if (!editingItem || !window.confirm('Delete this supplier?')) return;
                                    try {
                                      await apiRequest("DELETE", `/api/items/${editingItem.id}/suppliers/${supplier.id}`, {});
                                      setEditingSupplierCodes(prev => prev.filter(s => s.id !== supplier.id));
                                      toast({ title: t('common.success'), description: "Supplier removed" });
                                    } catch (error: any) {
                                      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                                    }
                                  }}
                                  data-testid={`button-delete-supplier-${supplier.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add New Supplier Form */}
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <Label className="text-sm font-medium">{t('items.addSupplier', 'Add Supplier')}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Supplier name *"
                        value={newSupplierCode.supplierName}
                        onChange={(e) => setNewSupplierCode(prev => ({ ...prev, supplierName: e.target.value }))}
                        data-testid="input-new-supplier-name"
                      />
                      <Input
                        placeholder="Article code"
                        value={newSupplierCode.articleCode}
                        onChange={(e) => setNewSupplierCode(prev => ({ ...prev, articleCode: e.target.value }))}
                        data-testid="input-new-supplier-article"
                      />
                      <Input
                        placeholder="Catalog URL"
                        value={newSupplierCode.catalogUrl}
                        onChange={(e) => setNewSupplierCode(prev => ({ ...prev, catalogUrl: e.target.value }))}
                        data-testid="input-new-supplier-url"
                      />
                      <Input
                        placeholder="Price per pack (CHF)"
                        type="number"
                        step="0.01"
                        value={newSupplierCode.basispreis}
                        onChange={(e) => setNewSupplierCode(prev => ({ ...prev, basispreis: e.target.value }))}
                        data-testid="input-new-supplier-price"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!newSupplierCode.supplierName}
                      onClick={async () => {
                        if (!editingItem || !newSupplierCode.supplierName) return;
                        try {
                          const res = await apiRequest("POST", `/api/items/${editingItem.id}/suppliers`, {
                            supplierName: newSupplierCode.supplierName,
                            articleCode: newSupplierCode.articleCode || null,
                            catalogUrl: newSupplierCode.catalogUrl || null,
                            basispreis: newSupplierCode.basispreis || null,
                            isPreferred: editingSupplierCodes.length === 0,
                          });
                          const created = await res.json();
                          setEditingSupplierCodes(prev => [...prev, created]);
                          setNewSupplierCode({ supplierName: "", articleCode: "", catalogUrl: "", basispreis: "" });
                          toast({ title: t('common.success'), description: "Supplier added" });
                        } catch (error: any) {
                          toast({ title: t('common.error'), description: error.message, variant: "destructive" });
                        }
                      }}
                      data-testid="button-add-supplier"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t('items.addSupplier', 'Add Supplier')}
                    </Button>
                  </div>
                  
                  {editingSupplierCodes.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">{t('items.noSupplierCodes', 'No supplier codes yet')}</p>
                  )}
                </div>
              </>
            )}
          </div>
          
          {/* Fixed Footer */}
          <div className="flex-shrink-0 bg-background z-10 px-6 py-4 border-t">
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={handleCloseEditCodes}>
                {t('common.close')}
              </Button>
              <Button onClick={handleSaveCodes} disabled={isSaving || isLoadingCodes || isAnalyzingPhoto}>
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.saving')}</> : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Barcode Scanner for individual code fields */}
      <BarcodeScanner
        isOpen={scanningCodeField !== null}
        onClose={() => setScanningCodeField(null)}
        onScan={(code) => {
          if (scanningCodeField) {
            handleCodeScan(code);
          }
        }}
        onManualEntry={() => {
          setScanningCodeField(null);
        }}
      />

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
              onClick={async () => {
                if (nameConfirmDialog) {
                  if (nameConfirmDialog.selectedName === 'supplier') {
                    try {
                      await apiRequest("PATCH", `/api/items/${nameConfirmDialog.itemId}`, { 
                        name: nameConfirmDialog.supplierName 
                      });
                      toast({
                        title: t('items.nameUpdated', 'Name Updated'),
                        description: nameConfirmDialog.supplierName,
                      });
                      // Refresh the data
                      refetch();
                    } catch (err: any) {
                      toast({
                        title: t('common.error'),
                        description: err.message || 'Failed to update name',
                        variant: "destructive",
                      });
                    }
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

      {/* Webcam Capture for Desktop */}
      <CameraCapture
        isOpen={webcamCaptureOpen}
        onClose={() => setWebcamCaptureOpen(false)}
        onCapture={handleWebcamCapture}
        fullFrame={true}
        hint={t('items.cameraHintGtin', 'Position barcode/product label in view')}
      />

    </div>
  );
}
