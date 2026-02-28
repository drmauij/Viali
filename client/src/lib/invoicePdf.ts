import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import i18next from "i18next";
import type { Surgery, Patient } from "@shared/schema";
import { formatDate, formatDateTime, formatDateForInput } from "@/lib/dateUtils";

// --- Types ---

export interface InvoicePdfOptions {
  surgery: Surgery;
  patient: Patient;
  hospitalId: string;
}

export interface InvoicePdfResult {
  success: boolean;
  error?: string;
}

interface StaffEntry {
  id: string;
  role: string;
  name: string;
}

interface InventoryUsageEntry {
  id: string;
  itemId: string;
  qty?: string | number;
  calculatedQty?: string | number;
  overrideQty?: string | number | null;
}

interface LookupItem {
  id: string;
  name: string;
}

// --- Helpers ---

const t = (key: string, fallback: string): string => {
  return i18next.t(key, fallback);
};

const ROLE_LABELS: Record<string, () => string> = {
  surgeon: () => t("invoice.pdf.role.surgeon", "Surgeon"),
  surgicalAssistant: () => t("invoice.pdf.role.surgicalAssistant", "Surgical Assistant"),
  instrumentNurse: () => t("invoice.pdf.role.instrumentNurse", "Instrument Nurse"),
  circulatingNurse: () => t("invoice.pdf.role.circulatingNurse", "Circulating Nurse"),
  anesthesiologist: () => t("invoice.pdf.role.anesthesiologist", "Anesthesiologist"),
  anesthesiaNurse: () => t("invoice.pdf.role.anesthesiaNurse", "Anesthesia Nurse"),
  pacuNurse: () => t("invoice.pdf.role.pacuNurse", "PACU Nurse"),
};

function getRoleLabel(role: string): string {
  const labelFn = ROLE_LABELS[role];
  return labelFn ? labelFn() : role;
}

function getSideLabel(side: string | null | undefined): string {
  if (!side) return "";
  switch (side) {
    case "left":
      return t("invoice.pdf.side.left", "Left");
    case "right":
      return t("invoice.pdf.side.right", "Right");
    case "both":
      return t("invoice.pdf.side.both", "Both");
    default:
      return side;
  }
}

/**
 * Calculate duration between two timestamps in "Xh Ymin" format.
 */
function calculateDuration(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  if (!start || !end) return "-";
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return "-";

  const diffMin = Math.round((endMs - startMs) / 60000);
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
}

/**
 * Build item name lookup map from both anesthesia items and regular inventory items.
 * Anesthesia items take precedence for duplicate IDs.
 */
function buildItemNameMap(
  anesthesiaItems: LookupItem[],
  inventoryItems: LookupItem[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of inventoryItems) {
    map.set(item.id, item.name);
  }
  // Anesthesia items override if same ID exists
  for (const item of anesthesiaItems) {
    map.set(item.id, item.name);
  }
  return map;
}

/**
 * Get effective quantity for an inventory usage entry.
 * Uses overrideQty if set, otherwise falls back to qty/calculatedQty.
 */
function getEffectiveQty(entry: InventoryUsageEntry): number {
  const raw =
    entry.overrideQty != null
      ? entry.overrideQty
      : entry.qty != null
        ? entry.qty
        : entry.calculatedQty;
  const num = typeof raw === "string" ? parseFloat(raw) : (raw ?? 0);
  return isNaN(num) ? 0 : num;
}

// --- Main export ---

/**
 * Generates a portrait invoice PDF for a surgery, fetching staff and inventory data.
 * Saves the file as Invoice_<Surname>_<FirstName>_<date>.pdf.
 */
export async function generateInvoicePdf(
  options: InvoicePdfOptions,
): Promise<InvoicePdfResult> {
  const { surgery, patient, hospitalId } = options;

  try {
    // Step 1: Fetch anesthesia record to get the recordId
    const recordRes = await fetch(
      `/api/anesthesia/records/surgery/${surgery.id}`,
      { credentials: "include" },
    );

    if (!recordRes.ok && recordRes.status !== 404) {
      throw new Error("Failed to load anesthesia record");
    }

    const anesthesiaRecord = recordRes.ok ? await recordRes.json() : null;

    // Step 2: Fetch staff, inventory, and lookup items in parallel
    let staffMembers: StaffEntry[] = [];
    let inventoryUsage: InventoryUsageEntry[] = [];

    // Always fetch lookup items (needed for inventory names)
    const [anesthesiaItemsRes, inventoryItemsRes] = await Promise.all([
      fetch(`/api/anesthesia/items/${hospitalId}`, { credentials: "include" }),
      fetch(`/api/items/${hospitalId}`, { credentials: "include" }),
    ]);

    const anesthesiaItems: LookupItem[] = anesthesiaItemsRes.ok
      ? await anesthesiaItemsRes.json()
      : [];
    const inventoryItems: LookupItem[] = inventoryItemsRes.ok
      ? await inventoryItemsRes.json()
      : [];

    // If we have a record, fetch staff and inventory
    if (anesthesiaRecord?.id) {
      const [staffRes, inventoryRes] = await Promise.all([
        fetch(`/api/anesthesia/staff/${anesthesiaRecord.id}`, {
          credentials: "include",
        }),
        fetch(`/api/anesthesia/inventory/${anesthesiaRecord.id}`, {
          credentials: "include",
        }),
      ]);

      staffMembers = staffRes.ok ? await staffRes.json() : [];
      inventoryUsage = inventoryRes.ok ? await inventoryRes.json() : [];
    }

    // Step 3: Build lookup map and filter inventory
    const itemNameMap = buildItemNameMap(anesthesiaItems, inventoryItems);

    const filteredInventory = inventoryUsage.filter(
      (entry) => getEffectiveQty(entry) > 0,
    );

    // Step 4: Generate PDF
    const doc = new jsPDF({ orientation: "portrait" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 20;

    // --- Header ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(
      t("invoice.pdf.title", "Surgery Documentation — Invoice"),
      pageWidth / 2,
      yPos,
      { align: "center" },
    );
    yPos += 8;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${t("invoice.pdf.generated", "Generated")}: ${formatDateTime(new Date())}`,
      pageWidth / 2,
      yPos,
      { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
    yPos += 10;

    // --- Separator line ---
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // --- Patient section ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("invoice.pdf.patient", "Patient"), margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const patientName = `${patient.surname}, ${patient.firstName}`;
    doc.text(
      `${t("invoice.pdf.name", "Name")}: ${patientName}`,
      margin,
      yPos,
    );
    yPos += 6;

    doc.text(
      `${t("invoice.pdf.dob", "Date of Birth")}: ${formatDate(patient.birthday)}`,
      margin,
      yPos,
    );
    yPos += 10;

    // --- Procedure section ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("invoice.pdf.procedure", "Procedure"), margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const surgeryName = surgery.plannedSurgery || "-";
    doc.text(
      `${t("invoice.pdf.surgery", "Surgery")}: ${surgeryName}`,
      margin,
      yPos,
    );
    yPos += 6;

    if (surgery.surgeon) {
      doc.text(
        `${t("invoice.pdf.surgeon", "Surgeon")}: ${surgery.surgeon}`,
        margin,
        yPos,
      );
      yPos += 6;
    }

    if (surgery.surgerySide) {
      doc.text(
        `${t("invoice.pdf.side", "Side")}: ${getSideLabel(surgery.surgerySide)}`,
        margin,
        yPos,
      );
      yPos += 6;
    }

    yPos += 4;

    // --- Times section ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("invoice.pdf.times", "Times"), margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    doc.text(
      `${t("invoice.pdf.date", "Date")}: ${formatDate(surgery.plannedDate)}`,
      margin,
      yPos,
    );
    yPos += 6;

    if (surgery.admissionTime) {
      doc.text(
        `${t("invoice.pdf.admission", "Admission")}: ${formatDateTime(surgery.admissionTime)}`,
        margin,
        yPos,
      );
      yPos += 6;
    }

    if (surgery.actualStartTime) {
      doc.text(
        `${t("invoice.pdf.startTime", "Start")}: ${formatDateTime(surgery.actualStartTime)}`,
        margin,
        yPos,
      );
      yPos += 6;
    }

    if (surgery.actualEndTime) {
      doc.text(
        `${t("invoice.pdf.endTime", "End")}: ${formatDateTime(surgery.actualEndTime)}`,
        margin,
        yPos,
      );
      yPos += 6;
    }

    if (surgery.actualStartTime && surgery.actualEndTime) {
      const duration = calculateDuration(
        surgery.actualStartTime,
        surgery.actualEndTime,
      );
      doc.text(
        `${t("invoice.pdf.duration", "Duration")}: ${duration}`,
        margin,
        yPos,
      );
      yPos += 6;
    }

    yPos += 6;

    // --- Staff table ---
    if (staffMembers.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(t("invoice.pdf.staff", "Staff"), margin, yPos);
      yPos += 4;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            t("invoice.pdf.staffName", "Name"),
            t("invoice.pdf.staffRole", "Role"),
          ],
        ],
        body: staffMembers.map((s) => [s.name, getRoleLabel(s.role)]),
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- Inventory table ---
    if (filteredInventory.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(t("invoice.pdf.inventory", "Inventory"), margin, yPos);
      yPos += 4;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            t("invoice.pdf.itemName", "Item"),
            t("invoice.pdf.itemQty", "Quantity"),
          ],
        ],
        body: filteredInventory.map((entry) => {
          const name =
            itemNameMap.get(entry.itemId) ||
            t("invoice.pdf.unknownItem", "Unknown item");
          const qty = getEffectiveQty(entry);
          return [name, String(qty)];
        }),
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
        margin: { left: margin, right: margin },
        styles: { fontSize: 9 },
        columnStyles: {
          1: { halign: "right", cellWidth: 30 },
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- Save ---
    const dateStr = formatDateForInput(surgery.plannedDate) || "unknown";
    const safeSurname = patient.surname.replace(/[^a-zA-Z0-9]/g, "_");
    const safeFirstName = patient.firstName.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `Invoice_${safeSurname}_${safeFirstName}_${dateStr}.pdf`;

    doc.save(filename);

    return { success: true };
  } catch (error: any) {
    console.error("[INVOICE-PDF] Error generating PDF:", error);
    return {
      success: false,
      error: error.message || "Failed to generate invoice PDF",
    };
  }
}
