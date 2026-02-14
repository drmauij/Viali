import type { ItemWithStock, UnitType, FilterType } from "./types";
import type { Folder, Vendor } from "@shared/schema";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { parseCurrencyValue } from "./helpers";

// ---------------------------------------------------------------------------
// Pure utility functions (no React deps)
// ---------------------------------------------------------------------------

/**
 * Compress an image file to a base64 JPEG string (max 800px, quality 0.7).
 */
export function compressImage(file: File): Promise<string> {
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
}

/**
 * Normalize a unit string to our canonical UnitType.
 */
export function normalizeUnit(unit: string | undefined | null): UnitType {
  if (!unit) return "Single unit";
  const normalized = unit.toLowerCase();
  if (normalized === "pack" || normalized === "box" || normalized.includes("pack")) {
    return "Pack";
  }
  return "Single unit";
}

/**
 * Calculate days remaining until an expiry date.
 * Returns null when no date is supplied.
 */
export function getDaysUntilExpiry(expiryDate?: Date): number | null {
  if (!expiryDate) return null;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Map days-until-expiry to a colour class name.
 */
export function getExpiryColor(days: number | null): string {
  if (!days || days < 0) return "expiry-red";
  if (days <= 30) return "expiry-red";
  if (days <= 60) return "expiry-orange";
  if (days <= 90) return "expiry-yellow";
  return "expiry-green";
}

/**
 * Derive a stock-status label and colour for an item.
 */
export function getStockStatus(
  item: ItemWithStock,
  t: any,
): { color: string; status: string } {
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
}

// ---------------------------------------------------------------------------
// Filter & sort
// ---------------------------------------------------------------------------

/**
 * Filter and sort a list of items based on search, filter, sort criteria,
 * and an optional item codes map (for pharmacode/GTIN search).
 */
export function filterAndSortItems(
  itemsToFilter: ItemWithStock[],
  searchTerm: string,
  activeFilter: FilterType,
  sortBy: string,
  itemCodesMap: Map<string, { gtin?: string; pharmacode?: string }>,
): ItemWithStock[] {
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
      case "expiry": {
        const aExpiry = a.soonestExpiry ? new Date(a.soonestExpiry).getTime() : Infinity;
        const bExpiry = b.soonestExpiry ? new Date(b.soonestExpiry).getTime() : Infinity;
        return aExpiry - bExpiry;
      }
      case "usage":
        return Math.random() - 0.5;
      case "stock": {
        const aStock = a.stockLevel?.qtyOnHand || 0;
        const bStock = b.stockLevel?.qtyOnHand || 0;
        return aStock - bStock;
      }
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return filtered;
}

/**
 * Compute counts for each filter tab.
 */
export function getFilterCounts(items: ItemWithStock[]): {
  all: number;
  runningLow: number;
  stockout: number;
  archived: number;
} {
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
}

// ---------------------------------------------------------------------------
// PDF inventory export
// ---------------------------------------------------------------------------

export interface DownloadInventoryPdfParams {
  items: ItemWithStock[];
  folders: Folder[];
  hospitalId: string;
  hospitalName: string;
  effectiveUnitId: string;
}

/**
 * Generate and download a PDF inventory list, grouped by folder.
 * Returns the number of items included (active only).
 */
export async function downloadInventoryPdf(params: DownloadInventoryPdfParams): Promise<number> {
  const { items, folders, hospitalId, hospitalName, effectiveUnitId } = params;

  // Fetch preferred supplier codes for all items
  let supplierCodesMap = new Map<string, { supplierName: string; basispreis: string | null }>();
  try {
    const response = await fetch(`/api/preferred-supplier-codes/${hospitalId}?unitId=${effectiveUnitId}`);
    if (response.ok) {
      const codes = await response.json();
      for (const code of codes) {
        supplierCodesMap.set(code.itemId, { supplierName: code.supplierName, basispreis: code.basispreis });
      }
    }
  } catch (error) {
    console.error("Error fetching supplier codes for PDF:", error);
  }

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

  // Header (portrait A4: 210mm width, center at 105mm)
  doc.setFontSize(18);
  doc.text("INVENTORY LIST", 105, 15, { align: "center" });

  doc.setFontSize(10);
  const exportDate = new Date().toLocaleDateString('en-GB');
  doc.text(`Hospital: ${hospitalName}`, 15, 25);
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
        { content: folderName.toUpperCase(), colSpan: 7, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] } }
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

    // Supplier info from preferred supplier
    const supplierInfo = supplierCodesMap.get(item.id);
    const supplierName = supplierInfo?.supplierName || "-";

    const row = [
      item.name,
      stockLabel,
      packSizeValue,
      currentItemsValue,
      String(item.minThreshold || 0),
      String(item.maxThreshold || 0),
      supplierName,
    ];

    tableData.push(row);
  });

  // Create table (portrait A4 = 210mm width, with 15mm margins = 180mm usable)
  autoTable(doc, {
    startY: 30,
    head: [[
      "Item Name",
      "Current Stock",
      "Pack Size",
      "Current Items",
      "Min",
      "Max",
      "Supplier"
    ]],
    body: tableData,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55 },   // Item Name
      1: { cellWidth: 25 },   // Current Stock
      2: { cellWidth: 18, halign: "center" },  // Pack Size
      3: { cellWidth: 20, halign: "center" },  // Current Items
      4: { cellWidth: 12, halign: "center" },  // Min
      5: { cellWidth: 12, halign: "center" },  // Max
      6: { cellWidth: 38 },   // Supplier
    },
    margin: { left: 15, right: 15 },
  });

  // Footer (portrait A4: 210x297mm, footer at 287mm from top, center at 105mm)
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} of ${pageCount}`,
      105,
      287,
      { align: "center" }
    );
  }

  // Sanitize hospital name for filename
  const sanitizedHospitalName = hospitalName.replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `inventory-${sanitizedHospitalName}-${new Date().toISOString().split('T')[0]}.pdf`;

  doc.save(filename);

  return activeItems.length;
}

// ---------------------------------------------------------------------------
// CSV template downloads
// ---------------------------------------------------------------------------

/**
 * Download a simple CSV template for item import.
 */
export function downloadSimpleCsvTemplate(): void {
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
}

/**
 * Download a medication-specific CSV template.
 */
export function downloadMedicationCsvTemplate(): void {
  const template = [
    ['Name', 'Description', 'Unit', 'Pack Size', 'Initial Stock', 'Min Threshold', 'Max Threshold', 'Critical', 'Controlled', 'Group', 'Route', 'DefaultDose', 'AmpouleQuantity', 'AmpouleUnit', 'AdministrationUnit', 'IsRateControlled', 'RateUnit'],
    ['Midazolam (Dormicum) 5mg', 'Benzodiazepine sedative', 'pack', '10', '20', '5', '15', 'false', 'true', 'Hypnotika', 'i.v.', '2', '5', 'mg', 'mg', 'false', ''],
    ['Propofol 200mg/20ml', 'Anesthetic agent 10mg/ml', 'pack', '10', '30', '10', '25', 'true', 'true', 'Hypnotika', 'i.v.', '100', '20', 'ml', 'mg', 'true', 'mg/h'],
    ['Fentanyl 0.5mg', 'Opioid analgesic', 'pack', '10', '25', '8', '20', 'true', 'true', 'Opioide', 'i.v.', '0.1', '0.5', 'mg', '\u00b5g', 'true', '\u00b5g/h'],
  ];

  const csvContent = template.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'medications_template.csv';
  link.click();
}

// ---------------------------------------------------------------------------
// Items catalog export (full CSV with codes, suppliers, etc.)
// ---------------------------------------------------------------------------

export interface DownloadItemsCatalogParams {
  hospitalId: string;
  hospitalName: string;
  unitId: string | undefined;
  items: ItemWithStock[];
  folders: Folder[];
  vendors: Vendor[];
}

/**
 * Fetch full item data (with codes & suppliers) and download as a comprehensive CSV.
 * Returns the number of items exported.
 */
export async function downloadItemsCatalog(params: DownloadItemsCatalogParams): Promise<number> {
  const { hospitalId, hospitalName, unitId, items, folders, vendors } = params;

  if (items.length === 0) {
    throw new Error("No items available to export");
  }

  const response = await fetch(`/api/items/${hospitalId}/export-catalog?unitId=${unitId}`);
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
  link.download = `items_catalog_${hospitalName}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  return itemsWithCodes.length;
}

// ---------------------------------------------------------------------------
// CSV / Excel parsing and column auto-mapping
// ---------------------------------------------------------------------------

/**
 * Auto-map CSV/Excel headers to known target field names.
 * Returns a mapping from the original column header to the system field name.
 */
export function autoMapHeaders(headers: string[]): Record<string, string> {
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
    // Patient price (used by Excel import as well)
    else if (lowerHeader === 'patientprice' || lowerHeader === 'patient price' || lowerHeader === 'final price' || lowerHeader === 'endpreis' || lowerHeader === 'abgabepreis') {
      autoMapping[header] = 'patientPrice';
    }
  });
  return autoMapping;
}

export interface ParseCsvResult {
  headers: string[];
  data: Record<string, any>[];
  autoMapping: Record<string, string>;
}

/**
 * Parse a CSV file and return headers, data rows, and an auto-mapped column mapping.
 */
export function parseCsvFile(file: File): Promise<ParseCsvResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          reject(new Error("The CSV file appears to be empty"));
          return;
        }

        const headers = results.meta.fields || [];
        const autoMapping = autoMapHeaders(headers);

        resolve({
          headers,
          data: results.data as Record<string, any>[],
          autoMapping,
        });
      },
      error: (error) => {
        reject(new Error(error.message || "Failed to parse CSV file"));
      }
    });
  });
}

/**
 * Parse an Excel file (.xlsx / .xls) and return headers, data rows,
 * and an auto-mapped column mapping.
 */
export async function parseExcelFile(file: File): Promise<ParseCsvResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    throw new Error("The Excel file appears to be empty");
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
    throw new Error("The Excel file appears to be empty");
  }

  const filteredHeaders = headers.filter(h => h);
  const autoMapping = autoMapHeaders(filteredHeaders);

  return {
    headers: filteredHeaders,
    data: jsonData,
    autoMapping,
  };
}

// ---------------------------------------------------------------------------
// CSV data processing (mapping rows to item objects)
// ---------------------------------------------------------------------------

/**
 * Transform parsed CSV/Excel rows into item objects using the user-defined
 * column mapping. Returns an array of item objects ready for bulk import.
 * Throws if no name column is mapped.
 */
export function processCsvData(
  csvData: Record<string, any>[],
  csvMapping: Record<string, string>,
): any[] {
  // Validate that name is mapped
  const nameColumn = Object.entries(csvMapping).find(([_, target]) => target === 'name')?.[0];
  if (!nameColumn) {
    throw new Error("Please map a column to 'Name' - this field is required");
  }

  const items: any[] = [];
  csvData.forEach((row) => {
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
        case 'controlled': {
          const boolVal = String(value).toLowerCase();
          item[targetField] = boolVal === 'true' || boolVal === 'yes' || boolVal === '1';
          break;
        }
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
        case 'maxUnits': {
          // Only set if value exists and is a valid number
          const numVal = value ? parseInt(value) : undefined;
          if (numVal !== undefined && !isNaN(numVal)) {
            item[targetField] = numVal;
          }
          break;
        }
        case 'trackExactQuantity': {
          const trackVal = String(value).toLowerCase();
          item[targetField] = trackVal === 'true' || trackVal === 'yes' || trackVal === '1';
          break;
        }
        // Image URL
        case 'imageUrl':
          item.imageUrl = value ? String(value) : undefined;
          break;
        // Barcodes (semicolon-separated)
        case 'barcodes':
          if (value) {
            item.barcodes = String(value).split(';').map((b: string) => b.trim()).filter((b: string) => b);
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
        case 'unitsPerPack': {
          if (!item.itemCodes) item.itemCodes = {};
          const upVal = value ? parseInt(value) : undefined;
          if (upVal !== undefined && !isNaN(upVal)) {
            item.itemCodes.unitsPerPack = upVal;
          }
          break;
        }
        // Supplier fields
        case 'preferredSupplier':
        case 'supplierArticleCode':
          if (!item.supplierInfo) item.supplierInfo = {};
          item.supplierInfo[targetField] = value ? String(value) : undefined;
          break;
        case 'supplierPrice':
          if (!item.supplierInfo) item.supplierInfo = {};
          // Parse currency-formatted values like "CHF 12,34" or "EUR 45,67"
          item.supplierInfo[targetField] = parseCurrencyValue(value);
          break;
        // Patient price (final dispensing price)
        case 'patientPrice':
          // Parse currency-formatted values like "CHF 12,34" or "EUR 45,67"
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

  return items;
}
