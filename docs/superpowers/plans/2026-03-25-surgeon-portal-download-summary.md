# Surgeon Portal: Download Surgery Summary PDF

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow surgeons to download their Surgery Summary PDF directly from the Surgeon Portal, eliminating the manual email-sending workflow for nurses.

**Architecture:** New API endpoint on the surgeon portal routes aggregates all data needed for the PDF (patient, surgery, anesthesia record, techniques, staff). Frontend adds a "Download Summary" button on completed surgery cards that fetches this data and generates the PDF client-side using the existing `generateSurgeonSummaryPDF()`.

**Tech Stack:** Express API route, Drizzle ORM queries, existing jsPDF client-side generation (`surgeonSummaryPdf.ts`).

---

### Task 1: Backend — Add summary data endpoint

**Files:**
- Modify: `server/routes/surgeonPortal.ts`

This endpoint aggregates all data needed for the Surgery Summary PDF in a single call. It reuses existing storage functions from `server/storage/anesthesia.ts` and the `storage` singleton.

- [ ] **Step 1: Add imports for anesthesia storage functions**

At the top of `server/routes/surgeonPortal.ts`, add imports for the anesthesia data functions:

```typescript
import {
  getAnesthesiaRecord,
  getSurgeryStaff,
  getGeneralTechnique,
  getNeuraxialBlocks,
  getPeripheralBlocks,
} from "../storage/anesthesia";
```

- [ ] **Step 2: Add the summary-data endpoint**

Add the following route before the `POST /action-requests` route (after the `GET /surgeries` route, around line 87):

```typescript
/**
 * GET /api/surgeon-portal/:token/surgeries/:surgeryId/summary-data
 * Returns all data needed to generate the Surgery Summary PDF.
 * Only available for completed surgeries.
 */
router.get("/api/surgeon-portal/:token/surgeries/:surgeryId/summary-data", requireSurgeonSession, async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token, surgeryId } = req.params;

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Verify the surgeon owns this surgery
    const surgeriesList = await getSurgeriesForSurgeon(hospital.id, surgeonEmail);
    const surgery = surgeriesList.find((s) => s.id === surgeryId);
    if (!surgery) {
      return res.status(403).json({ message: "You do not have access to this surgery" });
    }

    if (surgery.status !== "completed") {
      return res.status(400).json({ message: "Summary is only available for completed surgeries" });
    }

    // Fetch full surgery + patient data
    const fullSurgery = await storage.getSurgery(surgeryId);
    if (!fullSurgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const patient = fullSurgery.patientId
      ? await storage.getPatient(fullSurgery.patientId)
      : null;

    // Fetch anesthesia data
    const anesthesiaRecord = await getAnesthesiaRecord(surgeryId);

    let staffMembers: any[] = [];
    let generalTechniqueData: any = null;
    let neuraxialBlocksData: any[] = [];
    let peripheralBlocksData: any[] = [];

    if (anesthesiaRecord) {
      [staffMembers, generalTechniqueData, neuraxialBlocksData, peripheralBlocksData] = await Promise.all([
        getSurgeryStaff(anesthesiaRecord.id),
        getGeneralTechnique(anesthesiaRecord.id),
        getNeuraxialBlocks(anesthesiaRecord.id),
        getPeripheralBlocks(anesthesiaRecord.id),
      ]);
    }

    return res.json({
      patient: patient ? {
        firstName: patient.firstName,
        surname: patient.surname,
        birthday: patient.birthday,
        patientNumber: patient.patientNumber,
      } : null,
      surgery: {
        plannedSurgery: fullSurgery.plannedSurgery,
        chopCode: fullSurgery.chopCode,
        surgeon: fullSurgery.surgeon,
        plannedDate: fullSurgery.plannedDate,
        actualStartTime: fullSurgery.actualStartTime,
        actualEndTime: fullSurgery.actualEndTime,
        status: fullSurgery.status,
        anesthesiaType: fullSurgery.anesthesiaType,
        noPreOpRequired: fullSurgery.noPreOpRequired,
      },
      anesthesiaRecord: anesthesiaRecord ? {
        anesthesiaStartTime: anesthesiaRecord.anesthesiaStartTime,
        anesthesiaEndTime: anesthesiaRecord.anesthesiaEndTime,
        timeMarkers: anesthesiaRecord.timeMarkers,
        anesthesiaOverview: {
          general: !!(generalTechniqueData?.approach && generalTechniqueData.approach !== "sedation") || !!generalTechniqueData?.rsi,
          sedation: generalTechniqueData?.approach === "sedation",
          regionalSpinal: neuraxialBlocksData.some((b: any) => b.blockType === "spinal"),
          regionalEpidural: neuraxialBlocksData.some((b: any) => b.blockType === "epidural"),
          regionalPeripheral: peripheralBlocksData.length > 0,
        },
      } : null,
      staffMembers: staffMembers.map((s) => ({
        id: s.id,
        role: s.role,
        name: s.name,
        timestamp: s.createdAt,
      })),
      language: hospital.defaultLanguage || "de",
    });
  } catch (error) {
    logger.error("[SurgeonPortal] Error fetching summary data:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/surgeonPortal.ts
git commit -m "feat: add surgeon portal endpoint for surgery summary data"
```

---

### Task 2: Frontend — Add download button and handler

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`

- [ ] **Step 1: Add translations**

In the `translations` object, add these entries:

In the `de` section (around line 97, before `newRequest`):
```typescript
    downloadSummary: "OP-Zusammenfassung herunterladen",
    downloadingSummary: "Wird heruntergeladen...",
    downloadFailed: "Fehler beim Herunterladen. Bitte versuchen Sie es erneut.",
```

In the `en` section (around line 146, before `newRequest`):
```typescript
    downloadSummary: "Download Surgery Summary",
    downloadingSummary: "Downloading...",
    downloadFailed: "Download failed. Please try again.",
```

- [ ] **Step 2: Add Download import and handler**

Add `Download` to the lucide-react import (line 19-32), adding it to the existing icon list:
```typescript
import {
  Loader2,
  Mail,
  Globe,
  ShieldCheck,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  XCircle,
  RefreshCw,
  PauseCircle,
  Clock,
  Plus,
  LogOut,
  Download,
} from "lucide-react";
```

Add the import for `generateSurgeonSummaryPDF` at the top of the file (after the date-fns imports):
```typescript
import { generateSurgeonSummaryPDF } from "@/lib/surgeonSummaryPdf";
```

- [ ] **Step 3: Add download state and handler in SurgeonPortalContent**

Inside `SurgeonPortalContent`, after the `actionDialog` state declaration (around line 616), add:

```typescript
  const [downloadingSurgeryId, setDownloadingSurgeryId] = useState<string | null>(null);

  const handleDownloadSummary = async (surgery: Surgery) => {
    setDownloadingSurgeryId(surgery.id);
    try {
      const res = await fetch(`/api/surgeon-portal/${token}/surgeries/${surgery.id}/summary-data`);
      if (!res.ok) throw new Error("Failed to fetch summary data");
      const data = await res.json();

      if (!data.patient) throw new Error("Patient data not available");

      const doc = await generateSurgeonSummaryPDF({
        patient: data.patient,
        surgery: data.surgery,
        anesthesiaRecord: data.anesthesiaRecord,
        staffMembers: data.staffMembers,
        noPreOpRequired: data.surgery.noPreOpRequired,
        language: data.language,
      });

      const dateStr = new Date(surgery.plannedDate).toLocaleDateString("de-CH", {
        day: "2-digit", month: "2-digit", year: "numeric",
      }).replace(/\//g, "-");
      doc.save(`Surgery_Summary_${surgery.patientLastName || "Unknown"}_${dateStr}.pdf`);
    } catch (error) {
      console.error("Failed to download surgery summary:", error);
      alert(t.downloadFailed);
    } finally {
      setDownloadingSurgeryId(null);
    }
  };
```

- [ ] **Step 4: Add the download button to surgery cards**

In the surgery card rendering (inside the `selectedDaySurgeries.map` block), add the download button. After the action buttons block (the `{canRequestAction && ...}` section, around line 906), add:

```tsx
                          {/* Download summary for completed surgeries */}
                          {surgery.status === "completed" && (
                            <div className="pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleDownloadSummary(surgery)}
                                disabled={downloadingSurgeryId === surgery.id}
                              >
                                {downloadingSurgeryId === surgery.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    {t.downloadingSummary}
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3 mr-1" />
                                    {t.downloadSummary}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 6: Manual test**

1. Open Surgeon Portal, log in as a surgeon who has completed surgeries
2. Navigate to a month with a completed surgery
3. Click on the day → see the surgery card with "Download Summary" button
4. Click the button → PDF downloads with correct content
5. Verify the button shows loading state while downloading
6. Verify planned/in-progress surgeries do NOT show the download button

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/SurgeonPortal.tsx
git commit -m "feat: add download surgery summary button to surgeon portal"
```
