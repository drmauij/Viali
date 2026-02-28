# Admin PDF Download Columns — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two PDF download button columns to the business/administration Surgeries table — a full surgery PDF (reusing existing generation) and a simplified invoice PDF.

**Architecture:** Two new icon-button columns appended to the business column group in `SurgeryPlanningTable.tsx`. The full PDF reuses `downloadAnesthesiaRecordPdf()`. The invoice PDF is a new `generateInvoicePdf()` function that fetches staff + inventory data and renders a clean portrait PDF with jsPDF.

**Tech Stack:** jsPDF 3.0.3, jspdf-autotable 5.0.2, React, TypeScript, Lucide icons

---

### Task 1: Create the invoice PDF generator

**Files:**
- Create: `client/src/lib/invoicePdf.ts`

**Step 1: Create `client/src/lib/invoicePdf.ts`**

This file fetches staff + inventory data for a surgery and generates a portrait PDF.

```typescript
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import i18next from "i18next";
import type { Surgery, Patient } from "@shared/schema";
import { formatDate, formatDateTime } from "@/lib/dateUtils";

interface InvoicePdfOptions {
  surgery: Surgery;
  patient: Patient;
  hospitalId: string;
}

interface InvoicePdfResult {
  success: boolean;
  error?: string;
}

export async function generateInvoicePdf(
  options: InvoicePdfOptions
): Promise<InvoicePdfResult> {
  const { surgery, patient, hospitalId } = options;
  const t = i18next.t.bind(i18next);

  try {
    // Fetch anesthesia record to get recordId for staff/inventory
    const recordRes = await fetch(
      `/api/anesthesia/records/surgery/${surgery.id}`,
      { credentials: "include" }
    );

    let staffMembers: any[] = [];
    let inventoryUsage: any[] = [];

    if (recordRes.ok) {
      const record = await recordRes.json();
      if (record?.id) {
        // Fetch staff and inventory in parallel
        const [staffRes, inventoryRes] = await Promise.all([
          fetch(`/api/anesthesia/staff/${record.id}`, {
            credentials: "include",
          }),
          fetch(`/api/anesthesia/inventory/${record.id}`, {
            credentials: "include",
          }),
        ]);
        if (staffRes.ok) staffMembers = await staffRes.json();
        if (inventoryRes.ok) inventoryUsage = await inventoryRes.json();
      }
    }

    // Also fetch anesthesia items + inventory items for name lookups
    const [anesthItemsRes, invItemsRes] = await Promise.all([
      fetch(`/api/anesthesia/items/${hospitalId}`, { credentials: "include" }),
      fetch(`/api/items/${hospitalId}`, { credentials: "include" }),
    ]);
    const anesthItems = anesthItemsRes.ok ? await anesthItemsRes.json() : [];
    const invItems = invItemsRes.ok ? await invItemsRes.json() : [];

    // Build item name lookup map
    const itemNameMap = new Map<string, string>();
    for (const item of [...anesthItems, ...invItems]) {
      if (item.id && item.name) itemNameMap.set(item.id, item.name);
    }

    // Generate PDF
    const doc = new jsPDF({ orientation: "portrait" });
    let yPos = 20;

    // --- Header ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(
      t("business.invoicePdf.title", "Surgery Documentation — Invoice"),
      105,
      yPos,
      { align: "center" }
    );
    yPos += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${t("business.invoicePdf.generated", "Generated")}: ${formatDateTime(new Date())}`,
      105,
      yPos,
      { align: "center" }
    );
    yPos += 12;

    // --- Patient Info ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("business.invoicePdf.patientInfo", "Patient"), 14, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${t("business.invoicePdf.name", "Name")}: ${patient.surname}, ${patient.firstName}`,
      14,
      yPos
    );
    yPos += 6;
    if (patient.birthday) {
      doc.text(
        `${t("business.invoicePdf.dob", "Date of Birth")}: ${formatDate(patient.birthday)}`,
        14,
        yPos
      );
      yPos += 6;
    }
    yPos += 6;

    // --- Procedure ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("business.invoicePdf.procedure", "Procedure"), 14, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${t("business.invoicePdf.surgery", "Surgery")}: ${surgery.plannedSurgery || "-"}`,
      14,
      yPos
    );
    yPos += 6;
    doc.text(
      `${t("business.invoicePdf.surgeon", "Surgeon")}: ${surgery.surgeon || "-"}`,
      14,
      yPos
    );
    yPos += 6;
    if (surgery.surgerySide) {
      doc.text(
        `${t("business.invoicePdf.side", "Side")}: ${surgery.surgerySide}`,
        14,
        yPos
      );
      yPos += 6;
    }
    yPos += 6;

    // --- Times ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(t("business.invoicePdf.times", "Times"), 14, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${t("business.invoicePdf.date", "Date")}: ${surgery.plannedDate ? formatDate(surgery.plannedDate) : "-"}`,
      14,
      yPos
    );
    yPos += 6;
    if (surgery.admissionTime) {
      doc.text(
        `${t("business.invoicePdf.admission", "Admission")}: ${formatDateTime(surgery.admissionTime)}`,
        14,
        yPos
      );
      yPos += 6;
    }
    if (surgery.actualStartTime) {
      doc.text(
        `${t("business.invoicePdf.start", "Start")}: ${formatDateTime(surgery.actualStartTime)}`,
        14,
        yPos
      );
      yPos += 6;
    }
    if (surgery.actualEndTime) {
      doc.text(
        `${t("business.invoicePdf.end", "End")}: ${formatDateTime(surgery.actualEndTime)}`,
        14,
        yPos
      );
      yPos += 6;
    }
    if (surgery.actualStartTime && surgery.actualEndTime) {
      const durationMs =
        new Date(surgery.actualEndTime).getTime() -
        new Date(surgery.actualStartTime).getTime();
      const durationMin = Math.round(durationMs / 60000);
      doc.text(
        `${t("business.invoicePdf.duration", "Duration")}: ${durationMin} min`,
        14,
        yPos
      );
      yPos += 6;
    }
    yPos += 6;

    // --- Staff Table ---
    if (staffMembers.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(t("business.invoicePdf.staff", "Staff"), 14, yPos);
      yPos += 2;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            t("business.invoicePdf.staffName", "Name"),
            t("business.invoicePdf.staffRole", "Role"),
          ],
        ],
        body: staffMembers.map((s: any) => [
          s.name || s.userName || "-",
          s.role || "-",
        ]),
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // --- Inventory Table ---
    const usageWithNames = inventoryUsage
      .filter((u: any) => u.qty > 0 || u.overrideQty > 0)
      .map((u: any) => ({
        name: itemNameMap.get(u.itemId) || u.itemId,
        qty: u.overrideQty ?? u.qty,
      }));

    if (usageWithNames.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(
        t("business.invoicePdf.inventory", "Materials & Inventory"),
        14,
        yPos
      );
      yPos += 2;

      autoTable(doc, {
        startY: yPos,
        head: [
          [
            t("business.invoicePdf.itemName", "Item"),
            t("business.invoicePdf.itemQty", "Quantity"),
          ],
        ],
        body: usageWithNames.map((u: any) => [u.name, String(u.qty)]),
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
      });
    }

    // Save
    const patientName = `${patient.surname}_${patient.firstName}`.replace(
      /\s+/g,
      "_"
    );
    const dateStr = surgery.plannedDate
      ? formatDate(surgery.plannedDate).replace(/\./g, "-")
      : "unknown";
    doc.save(`Invoice_${patientName}_${dateStr}.pdf`);

    return { success: true };
  } catch (err: any) {
    console.error("Invoice PDF generation failed:", err);
    return { success: false, error: err.message || "PDF generation failed" };
  }
}
```

**Step 2: Verify the file compiles**

Run: `npm run check`
Expected: No errors related to `invoicePdf.ts`

**Step 3: Commit**

```bash
git add client/src/lib/invoicePdf.ts
git commit -m "feat(business): add invoice PDF generator for surgery documentation"
```

---

### Task 2: Add PDF download columns to the business table

**Files:**
- Modify: `client/src/components/shared/SurgeryPlanningTable.tsx`

**Step 1: Add imports**

At the top of `SurgeryPlanningTable.tsx`, add to the lucide-react import (around line 7):
- Add `FileDown` and `Receipt` icons

Add new imports:
```typescript
import { downloadAnesthesiaRecordPdf } from "@/lib/downloadAnesthesiaRecordPdf";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
```

**Step 2: Add anesthesia settings hook**

Inside the component function body (near other hooks around line ~985), add:
```typescript
const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings();
```

**Step 3: Add loading state**

Near other state declarations, add:
```typescript
const [downloadingFullPdf, setDownloadingFullPdf] = useState<string | null>(null);
const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState<string | null>(null);
```

These track the surgery ID currently being downloaded (null = not downloading).

**Step 4: Add table header columns**

After the Notes `<TableHead>` inside the `showBusiness` block (after line 1584), add:

```tsx
<TableHead className="text-center w-10">
  <FileDown className="h-4 w-4 inline" />
</TableHead>
<TableHead className="text-center w-10">
  <Receipt className="h-4 w-4 inline" />
</TableHead>
```

**Step 5: Add table body cells**

After the AdminNoteCell `<TableCell>` inside the `showBusiness` row block (after line 1829), add:

```tsx
{/* Full Surgery PDF */}
<TableCell onClick={(e) => e.stopPropagation()} className="text-center">
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8"
    disabled={downloadingFullPdf === surgery.id || !patient}
    onClick={async () => {
      if (!patient || !activeHospital?.id) return;
      setDownloadingFullPdf(surgery.id);
      try {
        const result = await downloadAnesthesiaRecordPdf({
          surgery,
          patient: patient as any,
          hospitalId: activeHospital.id,
          anesthesiaSettings,
        });
        if (!result.success) {
          toast({
            title: t("business.pdf.error", "PDF Error"),
            description: result.error || t("business.pdf.generationFailed", "PDF generation failed"),
            variant: "destructive",
          });
        }
      } finally {
        setDownloadingFullPdf(null);
      }
    }}
  >
    {downloadingFullPdf === surgery.id ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <FileDown className="h-4 w-4" />
    )}
  </Button>
</TableCell>

{/* Invoice PDF */}
<TableCell onClick={(e) => e.stopPropagation()} className="text-center">
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8"
    disabled={downloadingInvoicePdf === surgery.id || !patient}
    onClick={async () => {
      if (!patient || !activeHospital?.id) return;
      setDownloadingInvoicePdf(surgery.id);
      try {
        const result = await generateInvoicePdf({
          surgery,
          patient,
          hospitalId: activeHospital.id,
        });
        if (!result.success) {
          toast({
            title: t("business.pdf.error", "PDF Error"),
            description: result.error || t("business.pdf.generationFailed", "PDF generation failed"),
            variant: "destructive",
          });
        }
      } finally {
        setDownloadingInvoicePdf(null);
      }
    }}
  >
    {downloadingInvoicePdf === surgery.id ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Receipt className="h-4 w-4" />
    )}
  </Button>
</TableCell>
```

**Step 6: Verify it compiles**

Run: `npm run check`
Expected: PASS, no type errors

**Step 7: Commit**

```bash
git add client/src/components/shared/SurgeryPlanningTable.tsx
git commit -m "feat(business): add full PDF and invoice PDF download columns to admin table"
```

---

### Task 3: Add tooltip labels for the icon columns

**Files:**
- Modify: `client/src/components/shared/SurgeryPlanningTable.tsx`

**Step 1: Wrap both PDF buttons in Tooltip components**

The table already imports `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` (line 49). Wrap each `<Button>` in a Tooltip:

For full PDF button:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button ...>...</Button>
  </TooltipTrigger>
  <TooltipContent>
    {t("business.pdf.downloadFull", "Download Full Surgery PDF")}
  </TooltipContent>
</Tooltip>
```

For invoice PDF button:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button ...>...</Button>
  </TooltipTrigger>
  <TooltipContent>
    {t("business.pdf.downloadInvoice", "Download Invoice PDF")}
  </TooltipContent>
</Tooltip>
```

**Step 2: Verify**

Run: `npm run check`
Expected: PASS

**Step 3: Manual test**

Run: `npm run dev`
- Navigate to /business/administration
- Verify two new icon columns appear after Notes
- Hover each icon to see tooltip
- Click Full PDF icon on a surgery → downloads the full anesthesia record PDF
- Click Invoice icon on a surgery → downloads a clean portrait invoice PDF

**Step 4: Commit**

```bash
git add client/src/components/shared/SurgeryPlanningTable.tsx
git commit -m "feat(business): add tooltips to PDF download columns"
```
