# Questionnaire QR Poster PDF — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Download QR Poster" button to the admin questionnaire link card that generates a printable A4 PDF with hospital logo, name, QR code, and instructions.

**Architecture:** Client-side PDF generation using jsPDF (already in project) + `qrcode` npm package (new dependency). Single new utility file for PDF generation, small modifications to Hospital.tsx and translation files.

**Tech Stack:** jsPDF, qrcode, React, i18next

---

### Task 1: Install qrcode dependency

**Step 1: Install the package**

Run: `npm install qrcode`

**Step 2: Install types**

Run: `npm install -D @types/qrcode`

**Step 3: Verify installation**

Run: `npm ls qrcode`
Expected: Shows `qrcode@x.x.x`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qrcode dependency for QR poster PDF generation"
```

---

### Task 2: Add translation keys

**Files:**
- Modify: `client/src/i18n/locales/en.json:~1559` (after `generateLink` key)
- Modify: `client/src/i18n/locales/de.json:~1642` (after `generateLink` key)

**Step 1: Add English translation keys**

In `client/src/i18n/locales/en.json`, add these keys inside the `admin` section, after the `"generateLink"` key (line ~1559):

```json
"downloadQrPoster": "Download QR Poster",
"qrPosterTitle": "Patient Questionnaire",
"qrPosterInstruction": "Scan the QR code to fill out your pre-operative questionnaire",
"qrPosterUrlLabel": "Or visit:",
"qrPosterGenerating": "Generating poster..."
```

**Step 2: Add German translation keys**

In `client/src/i18n/locales/de.json`, add matching keys after `"generateLink"` (line ~1642):

```json
"downloadQrPoster": "QR-Poster herunterladen",
"qrPosterTitle": "Patientenfragebogen",
"qrPosterInstruction": "Scannen Sie den QR-Code, um Ihren präoperativen Fragebogen auszufüllen",
"qrPosterUrlLabel": "Oder besuchen Sie:",
"qrPosterGenerating": "Poster wird erstellt..."
```

**Step 3: Verify no TypeScript errors**

Run: `npm run check`
Expected: No new errors

**Step 4: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add translation keys for QR poster PDF"
```

---

### Task 3: Create questionnairePosterPdf.ts

**Files:**
- Create: `client/src/lib/questionnairePosterPdf.ts`

**Step 1: Create the PDF generation utility**

Create `client/src/lib/questionnairePosterPdf.ts` with this content:

```typescript
import jsPDF from "jspdf";
import QRCode from "qrcode";
import i18next from "i18next";

interface QuestionnairePosterOptions {
  questionnaireUrl: string;
  hospitalName: string;
  companyLogoUrl?: string;
}

/**
 * Generates a printable A4 PDF poster with a QR code linking to the patient questionnaire.
 * Intended to be printed and placed at the clinic entrance.
 */
export async function generateQuestionnairePosterPdf(
  options: QuestionnairePosterOptions
): Promise<void> {
  const { questionnaireUrl, hospitalName, companyLogoUrl } = options;
  const t = (key: string) => i18next.t(key);

  const doc = new jsPDF("portrait", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const centerX = pageWidth / 2;
  let yPos = 30;

  // --- Hospital Logo ---
  if (companyLogoUrl) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "Anonymous";
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => reject();
        logoImg.src = companyLogoUrl;
      });

      const scaleFactor = 4;
      const canvas = document.createElement("canvas");
      const origWidth = logoImg.naturalWidth || logoImg.width;
      const origHeight = logoImg.naturalHeight || logoImg.height;
      canvas.width = origWidth * scaleFactor;
      canvas.height = origHeight * scaleFactor;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
      }

      const maxLogoWidth = 60;
      const maxLogoHeight = 40;
      const aspectRatio = origWidth / origHeight;
      let logoWidth = maxLogoWidth;
      let logoHeight = logoWidth / aspectRatio;
      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = logoHeight * aspectRatio;
      }

      const logoX = (pageWidth - logoWidth) / 2;
      const flattenedLogoUrl = canvas.toDataURL("image/png");
      doc.addImage(flattenedLogoUrl, "PNG", logoX, yPos, logoWidth, logoHeight);
      yPos += logoHeight + 10;
    } catch (e) {
      console.warn("Failed to load hospital logo for QR poster:", e);
    }
  }

  // --- Hospital Name ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(hospitalName, centerX, yPos, { align: "center" });
  yPos += 15;

  // --- Divider line ---
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(50, yPos, pageWidth - 50, yPos);
  yPos += 15;

  // --- Subtitle ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(t("admin.qrPosterTitle"), centerX, yPos, { align: "center" });
  yPos += 20;

  // --- QR Code ---
  const qrSize = 80; // mm
  const qrDataUrl = await QRCode.toDataURL(questionnaireUrl, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: "H",
  });
  const qrX = (pageWidth - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, yPos, qrSize, qrSize);
  yPos += qrSize + 15;

  // --- Instruction text ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  const instructionText = t("admin.qrPosterInstruction");
  const lines = doc.splitTextToSize(instructionText, 150);
  doc.text(lines, centerX, yPos, { align: "center" });
  yPos += lines.length * 8 + 15;

  // --- URL for reference ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(t("admin.qrPosterUrlLabel"), centerX, yPos, { align: "center" });
  yPos += 6;
  doc.setFontSize(9);
  doc.text(questionnaireUrl, centerX, yPos, { align: "center" });

  // --- Download ---
  doc.save(`questionnaire-qr-poster.pdf`);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/lib/questionnairePosterPdf.ts
git commit -m "feat: add QR poster PDF generation utility"
```

---

### Task 4: Add Download QR Poster button to Hospital.tsx

**Files:**
- Modify: `client/src/pages/admin/Hospital.tsx:~1580-1614`

**Step 1: Add the import**

At the top of `client/src/pages/admin/Hospital.tsx` (around line 23, after the other imports), add:

```typescript
import { generateQuestionnairePosterPdf } from "@/lib/questionnairePosterPdf";
```

Also add `Download` to the lucide-react import on line 19:

```typescript
import { ..., Download, ... } from "lucide-react";
```

**Step 2: Add the download button**

In the button row (around line 1580-1614), after the existing `<div className="flex items-center gap-2">` block that contains the Regenerate and Disable buttons, add a new "Download QR Poster" button. Insert it inside the same flex container, after the Disable Link button (before the closing `</div>` at ~line 1614):

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={async () => {
    const url = getQuestionnaireUrl();
    if (!url) return;
    await generateQuestionnairePosterPdf({
      questionnaireUrl: url,
      hospitalName: hospitalForm.name || activeHospital?.name || "",
      companyLogoUrl: hospitalForm.companyLogoUrl || undefined,
    });
  }}
  data-testid="button-download-qr-poster"
>
  <Download className="h-4 w-4 mr-2" />
  {t("admin.downloadQrPoster", "Download QR Poster")}
</Button>
```

**Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

**Step 4: Manual test**

Run: `npm run dev`
- Go to Admin → Links tab
- Ensure a questionnaire link is generated
- Click "Download QR Poster"
- Verify PDF downloads with logo, hospital name, QR code, and instructions
- Scan the QR code with a phone to verify it opens the questionnaire URL

**Step 5: Commit**

```bash
git add client/src/pages/admin/Hospital.tsx
git commit -m "feat: add Download QR Poster button to admin questionnaire link card"
```
