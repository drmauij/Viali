import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/dateUtils";
import { compressImage } from "./itemHandlers";
import { isTouchDevice } from "./helpers";
import { isGS1Code, parseGS1Code } from "@/lib/gs1Parser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import BarcodeScanner from "@/components/BarcodeScanner";
import { CameraCapture } from "@/components/CameraCapture";
import { DirectItemCamera } from "@/components/DirectItemCamera";
import type { UnitType } from "./types";
import type { FormData, GalexisLookupResult } from "./useItemsState";

export interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string | undefined;
  /** Called after an item is successfully created (for cache invalidation, etc.) */
  onItemCreated?: () => void;
  /** Controlled flag for direct-camera mode opening from parent */
  directCameraOpen?: boolean;
  onDirectCameraOpenChange?: (open: boolean) => void;
}

const INITIAL_FORM_DATA: FormData = {
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
};

export function AddItemDialog({
  open,
  onOpenChange,
  unitId,
  onItemCreated,
  directCameraOpen = false,
  onDirectCameraOpenChange,
}: AddItemDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  // ── State ──────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<FormData>({ ...INITIAL_FORM_DATA });
  const [selectedUnit, setSelectedUnit] = useState<UnitType>("Pack");
  const [saveAndCloseAdd, setSaveAndCloseAdd] = useState(true);

  // Wizard stages
  const [addItemStage, setAddItemStage] = useState<"step1" | "step2" | "manual">("step1");

  // Product image analysis
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Codes analysis
  const [isAnalyzingCodes, setIsAnalyzingCodes] = useState(false);
  const [codesImage, setCodesImage] = useState<string | null>(null);

  // Galexis lookup
  const [isLookingUpGalexis, setIsLookingUpGalexis] = useState(false);
  const [galexisLookupResult, setGalexisLookupResult] = useState<GalexisLookupResult | null>(null);

  // Barcode scanner dialogs
  const [addItemScanner, setAddItemScanner] = useState(false);
  const [scanningCodeField, setScanningCodeField] = useState<"gtin" | "pharmacode" | "supplierCode" | null>(null);

  // Webcam capture (self-contained for add flow)
  const [webcamCaptureOpen, setWebcamCaptureOpen] = useState(false);
  const [webcamCaptureTarget, setWebcamCaptureTarget] = useState<"product" | "codes" | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const codesFileInputRef = useRef<HTMLInputElement>(null);
  const codesGalleryInputRef = useRef<HTMLInputElement>(null);
  const packSizeInputRef = useRef<HTMLInputElement>(null);
  const currentUnitsInputRef = useRef<HTMLInputElement>(null);
  const initialStockInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ─────────────────────────────────────────────────────────
  const handleNumberInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => { e.target.select(); }, 0);
  };

  // ── Reset ───────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormData({ ...INITIAL_FORM_DATA });
    setSelectedUnit("Pack");
    setUploadedImages([]);
    setAddItemStage("step1");
    setCodesImage(null);
    setScanningCodeField(null);
    setGalexisLookupResult(null);
    setIsLookingUpGalexis(false);
  };

  // ── Effects ─────────────────────────────────────────────────────────

  // Auto-calculate initial stock when trackExactQuantity is enabled
  useEffect(() => {
    if (formData.trackExactQuantity && formData.packSize && formData.currentUnits) {
      const packSize = parseInt(formData.packSize) || 1;
      const currentUnits = parseInt(formData.currentUnits) || 0;
      const calculatedStock = Math.ceil(currentUnits / packSize);
      setFormData(prev => ({ ...prev, initialStock: String(calculatedStock) }));
    }
  }, [formData.trackExactQuantity, formData.packSize, formData.currentUnits]);

  // Auto-enable trackExactQuantity for controlled packed items
  useEffect(() => {
    if (formData.controlled && selectedUnit === "Pack" && !formData.trackExactQuantity) {
      setFormData(prev => ({ ...prev, trackExactQuantity: true }));
    }
  }, [formData.controlled, selectedUnit]);

  // ── Mutation ────────────────────────────────────────────────────────
  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          hospitalId,
          unitId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === "LICENSE_LIMIT_REACHED") {
          // Bubble up to parent via error — the parent handles UpgradeDialog
          throw new Error("LICENSE_LIMIT_REACHED");
        }
        throw new Error(errorData.message || t("items.failedToCreate"));
      }

      return await response.json();
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      resetForm();
      if (saveAndCloseAdd) {
        onOpenChange(false);
      }
      toast({
        title: t("common.success"),
        description: t("items.itemCreatedSuccess"),
      });
      onItemCreated?.();
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("items.failedToCreate"),
        variant: "destructive",
      });
    },
  });

  // ── Galexis Lookup ──────────────────────────────────────────────────
  const lookupGalexisProduct = async (gtin: string) => {
    if (!gtin || !hospitalId) return;

    setIsLookingUpGalexis(true);
    setGalexisLookupResult(null);

    try {
      const response = await apiRequest("POST", "/api/items/galexis-lookup", {
        gtin,
        hospitalId,
        unitId,
      });
      const result: any = await response.json();

      // Check if item with same code already exists in this unit
      if (result.existingItem) {
        setGalexisLookupResult({
          found: false,
          message: t("items.duplicateCodeExists", `Item "${result.existingItem.itemName}" already has this code`),
        });
        toast({
          title: t("items.duplicateCodeFound", "Duplicate Code Found"),
          description: t("items.duplicateCodeDesc", `An item "${result.existingItem.itemName}" already has this code`),
          variant: "destructive",
        });
        setIsLookingUpGalexis(false);
        return;
      }

      if (result.found) {
        setFormData(prev => ({
          ...prev,
          name: result.name || prev.name,
          pharmacode: result.pharmacode || prev.pharmacode,
          gtin: result.gtin || prev.gtin,
          packSize: result.packSize ? String(result.packSize) : prev.packSize,
        }));

        setGalexisLookupResult({
          found: true,
          source: result.source || "galexis",
          packSize: result.packSize,
          basispreis: result.basispreis,
          publikumspreis: result.publikumspreis,
          yourPrice: result.yourPrice,
          discountPercent: result.discountPercent,
        });
        setAddItemStage("manual");

        toast({
          title: result.source === "hin" ? t("items.hinProductFound") : t("items.galexisProductFound"),
          description: result.name,
        });
      } else {
        setGalexisLookupResult({
          found: false,
          message: result.message,
          noIntegration: result.noIntegration,
        });
        setAddItemStage("step2");

        if (!result.noIntegration) {
          toast({
            title: t("items.galexisProductNotFound"),
            description: t("items.useStep2ForName"),
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      setGalexisLookupResult({ found: false, message: error.message });
      toast({
        title: t("items.galexisLookupFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLookingUpGalexis(false);
    }
  };

  // ── Image Handlers ──────────────────────────────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsAnalyzing(true);
    const allResults: any[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedImage = await compressImage(file);
        setUploadedImages(prev => [...prev, compressedImage]);

        try {
          const response = await apiRequest("POST", "/api/items/analyze-image", { image: compressedImage });
          const result: any = await response.json();
          allResults.push(result);

          if (i === 0 || !formData.name) {
            let itemName = result.name || "";
            if (result.concentration) itemName += ` ${result.concentration}`;
            if (result.size) itemName += ` ${result.size}`;

            setFormData(prev => ({
              ...prev,
              name: itemName.trim() || prev.name,
              description: result.description || prev.description,
              barcode: result.barcode || result.gtin || prev.barcode,
              imageUrl: i === 0 ? compressedImage : prev.imageUrl,
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
        setAddItemStage("manual");
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
      e.target.value = "";
    }
  };

  const handleCodesImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingCodes(true);

    try {
      const compressedImage = await compressImage(file);
      setCodesImage(compressedImage);

      const response = await apiRequest("POST", "/api/items/analyze-codes", { image: compressedImage });
      const result: any = await response.json();

      const extractedGtin = result.gtin || "";
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
        title: t("items.codesExtracted"),
        description: `${t("common.confidence")}: ${Math.round((result.confidence || 0) * 100)}%`,
      });

      if (extractedGtin) {
        await lookupGalexisProduct(extractedGtin);
      } else {
        setGalexisLookupResult({ found: false, message: t("items.noGtinExtracted") });
        setAddItemStage("step2");
      }
    } catch (error: any) {
      toast({
        title: t("items.codesExtractionFailed"),
        description: error.message || t("items.failedToExtractCodes"),
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingCodes(false);
      e.target.value = "";
    }
  };

  // ── Webcam Capture Handler ──────────────────────────────────────────
  const handleWebcamCapture = async (photo: string) => {
    setWebcamCaptureOpen(false);

    if (webcamCaptureTarget === "product") {
      setIsAnalyzing(true);
      try {
        setUploadedImages(prev => [...prev, photo]);

        const response = await apiRequest("POST", "/api/items/analyze-image", { image: photo });
        const result: any = await response.json();

        let itemName = result.name || "";
        if (result.concentration) itemName += ` ${result.concentration}`;
        if (result.size) itemName += ` ${result.size}`;

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
          title: t("common.success"),
          description: `${t("items.imageAnalyzed")} ${Math.round((result.confidence || 0) * 100)}% ${t("common.confidence").toLowerCase()}`,
        });
        setAddItemStage("manual");
      } catch (error: any) {
        toast({
          title: t("common.error"),
          description: error.message || t("items.failedToAnalyzeImage"),
          variant: "destructive",
        });
      } finally {
        setIsAnalyzing(false);
      }
    } else if (webcamCaptureTarget === "codes") {
      setIsAnalyzingCodes(true);
      setCodesImage(photo);

      try {
        const response = await apiRequest("POST", "/api/items/analyze-codes", { image: photo });
        const result: any = await response.json();

        const extractedGtin = result.gtin || "";
        if (extractedGtin) setFormData(prev => ({ ...prev, gtin: extractedGtin }));
        if (result.pharmacode) setFormData(prev => ({ ...prev, pharmacode: result.pharmacode }));
        if (result.lotNumber) setFormData(prev => ({ ...prev, lotNumber: result.lotNumber }));
        if (result.expiryDate) setFormData(prev => ({ ...prev, expiryDate: result.expiryDate }));
        if (result.migel) setFormData(prev => ({ ...prev, migel: result.migel }));
        if (result.atc) setFormData(prev => ({ ...prev, atc: result.atc }));

        toast({
          title: t("common.success"),
          description: t("items.codesExtracted"),
        });

        if (extractedGtin) {
          await lookupGalexisProduct(extractedGtin);
        } else {
          setGalexisLookupResult({ found: false, message: t("items.noGtinExtracted") });
          setAddItemStage("step2");
        }
      } catch (error: any) {
        toast({
          title: t("common.error"),
          description: error.message || t("items.failedToExtractCodes"),
          variant: "destructive",
        });
      } finally {
        setIsAnalyzingCodes(false);
      }
    }
  };

  // ── Photo / Scanner Handlers ────────────────────────────────────────
  const handleTakePhoto = (target: "product" | "codes") => {
    if (isTouchDevice()) {
      if (target === "product") {
        fileInputRef.current?.click();
      } else if (target === "codes") {
        codesFileInputRef.current?.click();
      }
    } else {
      setWebcamCaptureTarget(target);
      setWebcamCaptureOpen(true);
    }
  };

  const handleAddItemCodeScan = (code: string) => {
    if (!scanningCodeField) return;

    setFormData(prev => ({
      ...prev,
      [scanningCodeField]: code,
    }));

    toast({
      title: t("items.codeCaptured"),
      description: `${scanningCodeField.toUpperCase()}: ${code}`,
    });

    setScanningCodeField(null);
  };

  // ── Submit ──────────────────────────────────────────────────────────
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
      isService: formData.isService,
      initialStock: parseInt(formData.initialStock) || 0,
      imageUrl: formData.imageUrl || undefined,
    };

    // Capture codes data BEFORE mutate (mutation's onSuccess calls resetForm which clears formData)
    const codesData: any = {
      gtin: formData.gtin || null,
      pharmacode: formData.pharmacode || null,
      migel: formData.migel || null,
      atc: formData.atc || null,
      manufacturer: formData.manufacturer || null,
    };
    if (galexisLookupResult?.packSize) {
      codesData.unitsPerPack = galexisLookupResult.packSize;
    }
    const hasCodes = formData.gtin || formData.pharmacode || formData.migel || formData.atc || formData.manufacturer || galexisLookupResult?.packSize;

    const galexisSupplierData = galexisLookupResult?.found && galexisLookupResult?.basispreis ? {
      supplierName: galexisLookupResult.source === "hin" ? "HIN" : "Galexis",
      articleCode: formData.pharmacode || formData.gtin || "",
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

    const effectiveUnitId = unitId;

    createItemMutation.mutate(itemData, {
      onSuccess: async (createdItem) => {
        if (!createdItem) return;

        if (hasCodes) {
          try {
            await apiRequest("PUT", `/api/items/${createdItem.id}/codes`, codesData);
            toast({
              title: "Product codes saved",
              description: "GTIN/Pharmacode and other codes have been saved",
            });
          } catch (error: any) {
            console.error("Failed to save item codes:", error);
            toast({
              title: "Warning: Codes not saved",
              description: error.message || "Failed to save product codes",
              variant: "destructive",
            });
          }
        }

        if (galexisSupplierData) {
          try {
            await apiRequest("POST", `/api/items/${createdItem.id}/supplier-codes`, galexisSupplierData);
            toast({
              title: t("items.supplierAdded", "Supplier added"),
              description: `${galexisSupplierData.supplierName}: ${formatCurrency(galexisSupplierData.basispreis)}`,
            });
          } catch (error: any) {
            console.error("Failed to create supplier code:", error);
          }
        }

        if (lotData) {
          try {
            await apiRequest("POST", `/api/items/${createdItem.id}/lots`, {
              itemId: createdItem.id,
              unitId: effectiveUnitId,
              ...lotData,
            });
            toast({
              title: "Lot created",
              description: `LOT: ${lotData.lotNumber}${lotData.expiryDate ? ` (Exp: ${formatDate(new Date(lotData.expiryDate))})` : ""}`,
            });
          } catch (error: any) {
            console.error("Failed to create lot:", error);
            toast({
              title: "Warning: Lot not saved",
              description: error.message || "Failed to create lot record",
              variant: "destructive",
            });
          }
        }
      },
    });
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) resetForm();
        }}
        modal={!webcamCaptureOpen}
      >
        <DialogContent
          className="max-w-md max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => { if (webcamCaptureOpen) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (webcamCaptureOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{t("items.addNewItem")}</DialogTitle>
            <DialogDescription>{t("items.createNewInventoryItem")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddItem} className="space-y-4">
            {/* Step 1: Barcode/Codes Photo (Primary) */}
            {addItemStage === "step1" && (
            <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-primary text-primary-foreground">
                    1
                  </div>
                  <Label className="font-semibold">{t("items.step1ScanBarcode")}</Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t("items.step1BarcodeDescription")}</p>
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
                  onClick={() => handleTakePhoto("codes")}
                  disabled={isAnalyzingCodes || isLookingUpGalexis}
                  data-testid="button-scan-barcode"
                >
                  <i className={`fas ${isAnalyzingCodes || isLookingUpGalexis ? "fa-spinner fa-spin" : "fa-camera"} mr-2 text-lg`}></i>
                  <div className="text-left">
                    <div className="font-semibold">
                      {isAnalyzingCodes ? t("items.analyzing") : isLookingUpGalexis ? t("items.lookingUp") : t("controlled.takePhoto")}
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
                    <div className="font-semibold">{t("items.uploadFromGallery")}</div>
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
                <div className={`mt-3 p-3 rounded-lg ${galexisLookupResult.found ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"}`}>
                  {galexisLookupResult.found ? (
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <i className="fas fa-check-circle"></i>
                      <span className="text-sm font-medium">
                        {galexisLookupResult.source === "hin" ? t("items.productFoundViaHin") : t("items.productFoundViaGalexis")}
                      </span>
                    </div>
                  ) : (
                    <div className="text-amber-700 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span className="text-sm font-medium">{t("items.productNotFound")}</span>
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
                    <span className="text-sm font-medium">{t("items.extractedCodes")}</span>
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
                      onClick={() => setScanningCodeField("gtin")}
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
                        <i className={`fas ${isLookingUpGalexis ? "fa-spinner fa-spin" : "fa-search"} mr-1`}></i>
                        {t("items.lookup")}
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
                      onClick={() => setScanningCodeField("pharmacode")}
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
                onClick={() => setAddItemStage("step2")}
              >
                <i className="fas fa-forward mr-2"></i>
                {t("items.skipPhotoEntry")}
              </Button>
            </div>
            )}

            {/* Step 2: Product Photo (Fallback) */}
            {addItemStage === "step2" && (
              <div className="p-4 rounded-lg border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                  <Label className="font-semibold">{t("items.step2ProductPhoto")}</Label>
                  <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{t("items.step2FallbackDescription")}</p>
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
                    onClick={() => handleTakePhoto("product")}
                    disabled={isAnalyzing}
                    data-testid="button-camera-image"
                  >
                    <i className={`fas ${isAnalyzing ? "fa-spinner fa-spin" : "fa-camera"} mr-2`}></i>
                    {isAnalyzing ? t("items.analyzing") : t("controlled.takePhoto")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isAnalyzing}
                    data-testid="button-gallery-image"
                  >
                    <i className="fas fa-images mr-2"></i>
                    {t("items.uploadFromGallery")}
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
                  onClick={() => setAddItemStage("manual")}
                >
                  <i className="fas fa-forward mr-2"></i>
                  {t("items.skipToManualEntry")}
                </Button>
              </div>
            )}

            {/* Manual Form Fields */}
            {addItemStage === "manual" && (
            <>
            <div>
              <Label htmlFor="name">{t("items.itemName")} *</Label>
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
              <Label htmlFor="description">{t("items.description")}</Label>
              <Input
                id="description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-item-description"
              />
            </div>

            {/* Item Qualities - Controlled and Service */}
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="controlled"
                  name="controlled"
                  checked={formData.controlled}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, controlled: checked === true }))}
                  data-testid="checkbox-item-controlled"
                />
                <Label htmlFor="controlled" className="cursor-pointer">{t("items.controlled")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isService"
                  name="isService"
                  checked={formData.isService}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isService: checked === true }))}
                  data-testid="checkbox-item-service"
                />
                <Label htmlFor="isService" className="cursor-pointer">{t("items.serviceItem", "Service Item")}</Label>
              </div>
            </div>

            {/* Order Unit Selector */}
            <div>
              <Label>{t("items.placeOrdersBy")} *</Label>
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
                  <div className="text-xs font-medium">{t("items.pack")}</div>
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
                  <div className="text-xs font-medium">{t("items.singleUnit")}</div>
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
                  <Label htmlFor="trackExactQuantity" className={formData.controlled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}>{t("items.trackExactQuantity")}</Label>
                </div>
                {formData.controlled && (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    <i className="fas fa-info-circle mr-1"></i>
                    Required for controlled packed items
                  </p>
                )}
              </div>
            )}

            {/* Pack Size and Current Units */}
            {selectedUnit === "Pack" && formData.trackExactQuantity && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-900/50 space-y-4">
                <div>
                  <Label htmlFor="packSize">{t("items.packSize")} *</Label>
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
                  <p className="text-xs text-muted-foreground mt-1">{t("items.packSizeHelp")}</p>
                </div>
                <div>
                  <Label htmlFor="currentUnits">{t("items.currentUnits")} *</Label>
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
                  <p className="text-xs text-muted-foreground mt-1">{t("items.currentUnitsHelp")}</p>
                </div>
              </div>
            )}

            <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border-2 border-primary/30">
              <Label htmlFor="initialStock" className="text-base font-semibold">
                {t("items.actualStock")}
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
                <Label htmlFor="minThreshold">{t("items.minThreshold")}</Label>
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
                <Label htmlFor="maxThreshold">{t("items.maxThreshold")}</Label>
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
              <Button type="button" variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="secondary"
                disabled={createItemMutation.isPending || isAnalyzing}
                data-testid="button-save-item"
                onClick={() => setSaveAndCloseAdd(false)}
              >
                {createItemMutation.isPending && !saveAndCloseAdd ? t("common.loading") : t("common.save")}
              </Button>
              <Button
                type="submit"
                disabled={createItemMutation.isPending || isAnalyzing}
                data-testid="button-save-close-item"
                onClick={() => setSaveAndCloseAdd(true)}
              >
                {createItemMutation.isPending && saveAndCloseAdd ? t("common.loading") : t("items.saveAndClose", "Save & Close")}
              </Button>
            </div>
            </>
            )}
          </form>
        </DialogContent>
      </Dialog>

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
              title: t("items.barcodeScanned"),
              description: `GTIN: ${parsed.gtin || "N/A"}${parsed.lotNumber ? `, LOT: ${parsed.lotNumber}` : ""}${parsed.expiryDate ? `, EXP: ${parsed.expiryDate}` : ""}`,
            });
          } else if (/^\d{13,14}$/.test(code)) {
            setFormData(prev => ({
              ...prev,
              gtin: code.padStart(14, "0"),
            }));
            toast({
              title: t("items.barcodeScanned"),
              description: `GTIN: ${code}`,
            });
          } else if (/^\d{7}$/.test(code)) {
            setFormData(prev => ({
              ...prev,
              pharmacode: code,
            }));
            toast({
              title: t("items.pharmacodeScanned"),
              description: `Pharmacode: ${code}`,
            });
          } else {
            toast({
              title: t("items.codeScanned"),
              description: `${t("items.rawValue")}: ${code}`,
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

      {/* Desktop Webcam Capture (Add Item) */}
      <CameraCapture
        isOpen={webcamCaptureOpen}
        onClose={() => {
          setWebcamCaptureOpen(false);
          if (webcamCaptureTarget === "codes" && addItemStage === "step1") {
            setAddItemStage("step2");
          }
          setWebcamCaptureTarget(null);
        }}
        onCapture={handleWebcamCapture}
        fullFrame={webcamCaptureTarget !== "codes"}
        hint={webcamCaptureTarget === "codes" ? t("items.pointAtGtinEan", "Point at GTIN/EAN codes") : undefined}
      />

      {/* Direct Camera for streamlined Add Item workflow */}
      <DirectItemCamera
        isOpen={directCameraOpen}
        onClose={() => {
          onDirectCameraOpenChange?.(false);
          resetForm();
          setGalexisLookupResult(null);
        }}
        onCodesExtracted={async (codes) => {
          setGalexisLookupResult(null);

          setFormData(prev => ({
            ...prev,
            gtin: codes.gtin || prev.gtin,
            pharmacode: codes.pharmacode || prev.pharmacode,
            lotNumber: codes.lotNumber || prev.lotNumber,
            expiryDate: codes.expiryDate || prev.expiryDate,
            migel: codes.migel || prev.migel,
            atc: codes.atc || prev.atc,
          }));

          if (codes.gtin && hospitalId) {
            setIsLookingUpGalexis(true);
            try {
              const response = await apiRequest("POST", "/api/items/galexis-lookup", {
                gtin: codes.gtin,
                hospitalId,
                unitId,
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
                setGalexisLookupResult({
                  found: true,
                  source: result.source || "galexis",
                  packSize: result.packSize,
                  basispreis: result.basispreis,
                  publikumspreis: result.publikumspreis,
                  yourPrice: result.yourPrice,
                  discountPercent: result.discountPercent,
                });
                return { galexisFound: true, productName: result.name };
              } else {
                setGalexisLookupResult({ found: false, message: result.message });
              }
            } catch (error) {
              console.error("Galexis lookup failed:", error);
              setGalexisLookupResult({ found: false, message: "Lookup failed" });
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
          onDirectCameraOpenChange?.(false);
          onOpenChange(true);
          setAddItemStage("manual");
        }}
      />
    </>
  );
}
