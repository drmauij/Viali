# Patient Wristband PDF Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Print Wristband" button on the patient detail page that downloads a 279.4mm x 25.4mm PDF with patient identification data and a QR code for the Zebra ZD510 wristband printer.

**Architecture:** Client-side PDF generation using jsPDF (already installed) with QR code via the `qrcode` library (already installed). The QR code links to `/patients/:id` which already has a redirect route (`PatientRedirect`). No server changes needed.

**Tech Stack:** jsPDF, qrcode, React (existing component patterns)

---

### Task 1: Create wristband PDF generator

**Files:**
- Create: `client/src/lib/wristbandPdf.ts`

**Step 1: Write the wristband PDF generator**

Create `client/src/lib/wristbandPdf.ts` following the pattern from `questionnairePosterPdf.ts`:

```typescript
import jsPDF from "jspdf";
import QRCode from "qrcode";

interface WristbandData {
  patientName: string;      // "SURNAME, First Name"
  birthday: string;         // "dd.MM.yyyy"
  sex: string;              // "M" / "F" / "O"
  patientNumber: string;    // e.g. "P-2024-001"
  patientUrl: string;       // full URL for QR code: https://xxx.viali.ch/patients/123
}

export async function generateWristbandPdf(data: WristbandData): Promise<void> {
  // Wristband: 279.4mm wide x 25.4mm tall (landscape)
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [25.4, 279.4],
  });

  const pageHeight = 25.4;
  const qrSize = 18; // mm, fits within 25.4mm height with margins
  const margin = 3;
  let xPos = margin;
  const centerY = pageHeight / 2;

  // --- Patient Name (bold, largest text) ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.patientName, xPos, centerY - 3);

  // --- DOB, Sex, Patient Number (second line) ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const infoLine = `${data.birthday}  •  ${data.sex}  •  ${data.patientNumber}`;
  doc.text(infoLine, xPos, centerY + 4);

  // --- QR Code (right side) ---
  const qrDataUrl = await QRCode.toDataURL(data.patientUrl, {
    width: 400,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrX = 279.4 - margin - qrSize;
  const qrY = (pageHeight - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // --- Download ---
  const safeName = data.patientName.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`wristband-${safeName}.pdf`);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors related to wristbandPdf.ts

**Step 3: Commit**

```bash
git add client/src/lib/wristbandPdf.ts
git commit -m "feat: add wristband PDF generator for Zebra ZD510"
```

---

### Task 2: Add "Print Wristband" button to patient detail page

**Files:**
- Modify: `client/src/pages/anesthesia/PatientDetail.tsx` (lines 1760-1814, the action buttons area in the patient card header)

**Step 1: Add import and handler**

At the top of PatientDetail.tsx, add:
```typescript
import { Printer } from "lucide-react";
import { generateWristbandPdf } from "@/lib/wristbandPdf";
import { formatDate } from "@/lib/dateUtils";
```

Add handler function (near other handlers like `handleDownloadPDF`):
```typescript
const handlePrintWristband = async () => {
  if (!patient) return;
  try {
    const patientUrl = `${window.location.origin}/patients/${patient.id}`;
    await generateWristbandPdf({
      patientName: `${patient.surname}, ${patient.firstName}`,
      birthday: formatDate(patient.birthday),
      sex: patient.sex || "O",
      patientNumber: patient.patientNumber || "",
      patientUrl,
    });
    toast({ title: t('common.success', 'Success'), description: t('anesthesia.patientDetail.wristbandDownloaded', 'Wristband PDF downloaded') });
  } catch (error) {
    console.error("Failed to generate wristband PDF:", error);
    toast({ title: t('common.error', 'Error'), description: t('anesthesia.patientDetail.wristbandError', 'Failed to generate wristband PDF'), variant: "destructive" });
  }
};
```

**Step 2: Add button to patient card header**

In the action buttons area (line ~1761, inside the `canWrite && (` block, before the Edit button), add:

```tsx
<Button
  variant="outline"
  size="icon"
  onClick={handlePrintWristband}
  data-testid="button-print-wristband"
  title={t('anesthesia.patientDetail.printWristband', 'Print Wristband')}
>
  <Printer className="h-4 w-4" />
</Button>
```

**Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: Clean pass

**Step 4: Test manually**

1. Open any patient detail page
2. Click the Printer icon button in the patient card header
3. A PDF should download named `wristband-SURNAME_FirstName.pdf`
4. Open the PDF — verify it's 279.4mm x 25.4mm with patient data and QR code
5. Scan the QR code — should open `/patients/:id` route

**Step 5: Commit**

```bash
git add client/src/pages/anesthesia/PatientDetail.tsx
git commit -m "feat: add Print Wristband button to patient detail page"
```

---

### Task 3: Add i18n translation keys

**Files:**
- Modify: `client/src/i18n/locales/de.json`
- Modify: `client/src/i18n/locales/en.json`

**Step 1: Add translation keys**

In `en.json` under `anesthesia.patientDetail`:
```json
"printWristband": "Print Wristband",
"wristbandDownloaded": "Wristband PDF downloaded",
"wristbandError": "Failed to generate wristband PDF"
```

In `de.json` under `anesthesia.patientDetail`:
```json
"printWristband": "Armband drucken",
"wristbandDownloaded": "Armband-PDF heruntergeladen",
"wristbandError": "Armband-PDF konnte nicht erstellt werden"
```

**Step 2: Commit**

```bash
git add client/src/i18n/locales/de.json client/src/i18n/locales/en.json
git commit -m "feat: add i18n translations for wristband printing"
```

---

### Task 4: Final verification

**Step 1: Run typecheck**
Run: `npm run check`
Expected: Clean pass

**Step 2: Test end-to-end**
1. Navigate to patient detail
2. Click wristband printer button
3. PDF downloads with correct dimensions and data
4. QR code scans and redirects to patient page
