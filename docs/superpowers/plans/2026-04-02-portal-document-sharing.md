# Portal Document Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow staff to share signed discharge briefs with patients via the patient portal, with share/unshare/notify actions and secure download.

**Architecture:** Three new columns on `discharge_briefs` for portal visibility tracking. Staff-side share dialog on brief cards. Portal-side documents section with secure signed-URL downloads. Notification via existing Resend email / ASPSMS+Vonage SMS infrastructure.

**Tech Stack:** Drizzle ORM, Express routes, React + TanStack Query, Resend (email), ASPSMS/Vonage (SMS), Exoscale SOS (S3-compatible object storage)

---

### Task 1: Schema + Migration

**Files:**
- Modify: `shared/schema.ts` (lines ~5714-5745, discharge_briefs table)
- Create: `migrations/XXXX_add_portal_sharing_columns.sql` (via `npm run db:generate`)

- [ ] **Step 1: Add columns to schema**

In `shared/schema.ts`, add three columns to the `dischargeBriefs` table definition, after the `unlockReason` field:

```typescript
  // Portal sharing
  portalVisible: boolean("portal_visible").default(false),
  portalSharedAt: timestamp("portal_shared_at"),
  portalSharedBy: varchar("portal_shared_by").references(() => users.id),
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 3: Make migration idempotent**

Open the generated migration SQL file in `migrations/`. Replace the statements with idempotent versions:

```sql
ALTER TABLE "discharge_briefs" ADD COLUMN IF NOT EXISTS "portal_visible" boolean DEFAULT false;
ALTER TABLE "discharge_briefs" ADD COLUMN IF NOT EXISTS "portal_shared_at" timestamp;
ALTER TABLE "discharge_briefs" ADD COLUMN IF NOT EXISTS "portal_shared_by" varchar;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discharge_briefs_portal_shared_by_users_id_fk'
  ) THEN
    ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_portal_shared_by_users_id_fk" FOREIGN KEY ("portal_shared_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
```

- [ ] **Step 4: Verify journal timestamp**

Check `migrations/meta/_journal.json` — the new entry's `when` value must be higher than ALL previous entries.

- [ ] **Step 5: Run migration**

Run: `npm run db:migrate`

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: PASS with no errors

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add portal sharing columns to discharge_briefs"
```

---

### Task 2: Storage Functions

**Files:**
- Modify: `server/storage/dischargeBriefs.ts`

- [ ] **Step 1: Add shareDischargeBrief function**

Add after the `unlockDischargeBrief` function:

```typescript
export async function shareDischargeBrief(
  id: string,
  userId: string,
): Promise<DischargeBrief> {
  const now = new Date();
  const [brief] = await db
    .update(dischargeBriefs)
    .set({
      portalVisible: true,
      portalSharedAt: now,
      portalSharedBy: userId,
      updatedAt: now,
    })
    .where(eq(dischargeBriefs.id, id))
    .returning();
  return brief;
}

export async function unshareDischargeBrief(
  id: string,
): Promise<DischargeBrief> {
  const [brief] = await db
    .update(dischargeBriefs)
    .set({
      portalVisible: false,
      portalSharedAt: null,
      portalSharedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(dischargeBriefs.id, id))
    .returning();
  return brief;
}

export async function getPortalVisibleBriefsForPatient(
  patientId: string,
): Promise<(DischargeBrief & { signer: User | null })[]> {
  const rows = await db
    .select()
    .from(dischargeBriefs)
    .where(
      and(
        eq(dischargeBriefs.patientId, patientId),
        eq(dischargeBriefs.portalVisible, true),
        eq(dischargeBriefs.isLocked, true),
      ),
    )
    .orderBy(dischargeBriefs.signedAt);

  const results: (DischargeBrief & { signer: User | null })[] = [];
  for (const brief of rows) {
    let signer: User | null = null;
    if (brief.signedBy) {
      const [s] = await db.select().from(users).where(eq(users.id, brief.signedBy));
      signer = s || null;
    }
    results.push({ ...brief, signer });
  }
  return results;
}
```

- [ ] **Step 2: Add imports if needed**

Ensure `and` is imported from `drizzle-orm` at the top of the file. Check existing imports.

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/storage/dischargeBriefs.ts
git commit -m "feat: add share/unshare/portal-visible storage functions"
```

---

### Task 3: Backend Share/Unshare/Notify Endpoints

**Files:**
- Modify: `server/routes/dischargeBriefs.ts`

- [ ] **Step 1: Add imports**

At the top of the file, add the new storage functions to the existing import:

```typescript
import {
  // ... existing imports ...
  shareDischargeBrief,
  unshareDischargeBrief,
} from "../storage/dischargeBriefs";
```

Also add these imports for the notification functionality:

```typescript
import { sendSms } from "../sms";
import { getQuestionnaireLinkByToken } from "../storage/questionnaires";
```

Check if `sendPortalDocumentNotificationEmail` needs to be created (Task 4) or if an existing email function can be reused. For now, import Resend directly:

```typescript
import { Resend } from "resend";
```

And import patient/questionnaire tables for looking up contact info:

```typescript
import { patients, patientQuestionnaireLinks } from "@shared/schema";
```

- [ ] **Step 2: Add share endpoint**

Add after the unlock endpoint (after the `POST /api/discharge-briefs/:id/unlock` route):

```typescript
// Share brief to patient portal
router.post(
  "/api/discharge-briefs/:id/share",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (!brief.isLocked) {
        return res.status(400).json({ message: "Only signed briefs can be shared" });
      }
      if (!brief.pdfUrl) {
        return res.status(400).json({ message: "Brief must have a PDF before sharing. Export PDF first." });
      }

      const userId = req.user?.id;
      await shareDischargeBrief(req.params.id, userId);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "share",
        userId,
        oldValue: null,
        newValue: { portalVisible: true },
      });

      const fullBrief = await getDischargeBriefById(req.params.id);
      res.json(fullBrief);
    } catch (error: any) {
      logger.error("Error sharing discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);
```

- [ ] **Step 3: Add unshare endpoint**

```typescript
// Unshare brief from patient portal
router.post(
  "/api/discharge-briefs/:id/unshare",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }

      const userId = req.user?.id;
      await unshareDischargeBrief(req.params.id);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "unshare",
        userId,
        oldValue: { portalVisible: true },
        newValue: { portalVisible: false },
      });

      const fullBrief = await getDischargeBriefById(req.params.id);
      res.json(fullBrief);
    } catch (error: any) {
      logger.error("Error unsharing discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);
```

- [ ] **Step 4: Add notify-patient endpoint**

```typescript
// Notify patient about shared document
router.post(
  "/api/discharge-briefs/:id/notify-patient",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const { method } = req.body; // "email" or "sms"
      if (!method || !["email", "sms"].includes(method)) {
        return res.status(400).json({ message: "method must be 'email' or 'sms'" });
      }

      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (!brief.portalVisible) {
        return res.status(400).json({ message: "Brief must be shared to portal before notifying" });
      }

      // Find patient contact info
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, brief.patientId));
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Find the patient's portal token for the link
      const [link] = await db
        .select()
        .from(patientQuestionnaireLinks)
        .where(eq(patientQuestionnaireLinks.patientId, brief.patientId))
        .orderBy(patientQuestionnaireLinks.createdAt)
        .limit(1);

      if (!link) {
        return res.status(400).json({ message: "Patient has no portal link" });
      }

      const portalUrl = `${process.env.APP_URL || "https://app.viali.ch"}/patient-portal/${link.token}`;

      // Get hospital info for the notification
      const [hospital] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.id, brief.hospitalId));
      const hospitalName = hospital?.name || "Viali";
      const language = hospital?.defaultLanguage || "de";

      if (method === "email") {
        const email = patient.email;
        if (!email) {
          return res.status(400).json({ message: "Patient has no email address" });
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          return res.status(500).json({ message: "Email service not configured" });
        }

        const resend = new Resend(resendApiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@viali.ch";

        const subjects: Record<string, string> = {
          de: `Neues Dokument verfügbar — ${hospitalName}`,
          en: `New document available — ${hospitalName}`,
          fr: `Nouveau document disponible — ${hospitalName}`,
          it: `Nuovo documento disponibile — ${hospitalName}`,
        };

        const bodies: Record<string, string> = {
          de: `<p>Guten Tag</p><p>Ein neues Dokument wurde für Sie im Patientenportal bereitgestellt.</p><p><a href="${portalUrl}">Zum Patientenportal</a></p><p>Freundliche Grüsse<br/>${hospitalName}</p>`,
          en: `<p>Hello</p><p>A new document has been made available for you on the patient portal.</p><p><a href="${portalUrl}">Go to Patient Portal</a></p><p>Best regards<br/>${hospitalName}</p>`,
          fr: `<p>Bonjour</p><p>Un nouveau document a été mis à votre disposition sur le portail patient.</p><p><a href="${portalUrl}">Accéder au portail patient</a></p><p>Cordialement<br/>${hospitalName}</p>`,
          it: `<p>Buongiorno</p><p>Un nuovo documento è stato messo a disposizione nel portale pazienti.</p><p><a href="${portalUrl}">Vai al portale pazienti</a></p><p>Cordiali saluti<br/>${hospitalName}</p>`,
        };

        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: subjects[language] || subjects.de,
          html: bodies[language] || bodies.de,
        });
      } else {
        // SMS
        const phone = patient.phone;
        if (!phone) {
          return res.status(400).json({ message: "Patient has no phone number" });
        }

        const smsMessages: Record<string, string> = {
          de: `${hospitalName}: Ein neues Dokument ist für Sie im Patientenportal verfügbar. ${portalUrl}`,
          en: `${hospitalName}: A new document is available on your patient portal. ${portalUrl}`,
          fr: `${hospitalName}: Un nouveau document est disponible sur votre portail patient. ${portalUrl}`,
          it: `${hospitalName}: Un nuovo documento è disponibile nel portale pazienti. ${portalUrl}`,
        };

        const result = await sendSms(
          phone,
          smsMessages[language] || smsMessages.de,
          brief.hospitalId,
        );
        if (!result.success) {
          return res.status(500).json({ message: "Failed to send SMS: " + result.error });
        }
      }

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "notify_patient",
        userId: req.user?.id,
        oldValue: null,
        newValue: { notificationType: method },
      });

      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error notifying patient about shared brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);
```

- [ ] **Step 5: Add missing imports at top of file**

Ensure `hospitals` and `patients` tables are imported from `@shared/schema`. Check existing imports — `hospitals` may already be imported. Add `patients` and `patientQuestionnaireLinks` if missing.

Also ensure `Resend` is imported from `"resend"` and `sendSms` from `"../sms"`.

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/routes/dischargeBriefs.ts
git commit -m "feat: add share/unshare/notify-patient endpoints for briefs"
```

---

### Task 4: Portal Documents Endpoint + Download

**Files:**
- Modify: `server/routes/questionnaire.ts` (portal routes)

- [ ] **Step 1: Add imports**

Add to imports at top of `questionnaire.ts`:

```typescript
import {
  getPortalVisibleBriefsForPatient,
} from "../storage/dischargeBriefs";
```

Also import `ObjectStorageService` if not already imported:

```typescript
import { ObjectStorageService } from "../objectStorage";
```

- [ ] **Step 2: Find the portal documents endpoint**

The existing `GET /api/patient-portal/:token/documents` endpoint (around line 2940) returns only `patient_upload` documents. We need to add shared briefs to this response OR create a separate endpoint. To keep concerns separate and avoid breaking existing behavior, create a new endpoint.

Add after the existing documents endpoint:

```typescript
// Get portal-shared discharge briefs for patient
router.get(
  "/api/patient-portal/:token/shared-briefs",
  requirePortalVerification("patient"),
  async (req: any, res: Response) => {
    try {
      const link = await storage.getQuestionnaireLinkByToken(req.params.token);
      if (!link || !link.patientId) {
        return res.status(404).json({ message: "Invalid portal link" });
      }

      const briefs = await getPortalVisibleBriefsForPatient(link.patientId);

      res.json(
        briefs.map((b) => ({
          id: b.id,
          briefType: b.briefType,
          language: b.language,
          signedAt: b.signedAt,
          signerName: b.signer
            ? `${b.signer.firstName || ""} ${b.signer.lastName || ""}`.trim()
            : null,
        })),
      );
    } catch (error: any) {
      logger.error("Error fetching portal shared briefs:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Download a shared brief PDF
router.get(
  "/api/patient-portal/:token/shared-briefs/:briefId/download",
  requirePortalVerification("patient"),
  async (req: any, res: Response) => {
    try {
      const link = await storage.getQuestionnaireLinkByToken(req.params.token);
      if (!link || !link.patientId) {
        return res.status(404).json({ message: "Invalid portal link" });
      }

      const brief = await getDischargeBriefById(req.params.briefId);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }

      // Security: verify brief belongs to this patient, is portal-visible, is signed, has PDF
      if (brief.patientId !== link.patientId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!brief.portalVisible) {
        return res.status(403).json({ message: "Document is not shared" });
      }
      if (!brief.isLocked || !brief.pdfUrl) {
        return res.status(400).json({ message: "Document not available for download" });
      }

      const s3 = ObjectStorageService.getInstance();
      const downloadUrl = await s3.getObjectDownloadURL(brief.pdfUrl, 900); // 15 minutes

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "portal_download",
        userId: null,
        oldValue: null,
        newValue: { patientId: link.patientId, portalToken: req.params.token },
      });

      res.json({ downloadUrl });
    } catch (error: any) {
      logger.error("Error downloading shared brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);
```

- [ ] **Step 3: Add getDischargeBriefById import**

```typescript
import { getDischargeBriefById } from "../storage/dischargeBriefs";
```

Check if `createAuditLog` is already imported. If not:

```typescript
import { createAuditLog } from "../storage/auditLog";
```

- [ ] **Step 4: TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/questionnaire.ts
git commit -m "feat: add portal shared-briefs list and download endpoints"
```

---

### Task 5: Staff UI — Share Dialog on Brief Cards

**Files:**
- Modify: `client/src/components/shared/PatientDocumentsSection.tsx`

- [ ] **Step 1: Add imports**

Add to the existing lucide-react imports:

```typescript
import { Share2 } from "lucide-react";
```

Add Dialog/Select imports if not already present:

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
```

- [ ] **Step 2: Add state for share dialog**

In the component function body, add state variables:

```typescript
const [shareDialogBrief, setShareDialogBrief] = useState<DischargeBrief | null>(null);
const [notifyMethod, setNotifyMethod] = useState<"email" | "sms" | null>(null);
```

- [ ] **Step 3: Add share/unshare mutations**

```typescript
const shareMutation = useMutation({
  mutationFn: async (briefId: string) => {
    await apiRequest("POST", `/api/discharge-briefs/${briefId}/share`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/discharge-briefs`] });
    toast({ title: t("dischargeBriefs.shared", "Document shared to patient portal") });
    setShareDialogBrief(null);
  },
  onError: (error: Error) => {
    toast({ title: t("dischargeBriefs.shareError", "Failed to share"), description: error.message, variant: "destructive" });
  },
});

const unshareMutation = useMutation({
  mutationFn: async (briefId: string) => {
    await apiRequest("POST", `/api/discharge-briefs/${briefId}/unshare`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/discharge-briefs`] });
    toast({ title: t("dischargeBriefs.unshared", "Document removed from patient portal") });
    setShareDialogBrief(null);
  },
  onError: (error: Error) => {
    toast({ title: t("dischargeBriefs.unshareError", "Failed to unshare"), description: error.message, variant: "destructive" });
  },
});

const notifyMutation = useMutation({
  mutationFn: async ({ briefId, method }: { briefId: string; method: string }) => {
    await apiRequest("POST", `/api/discharge-briefs/${briefId}/notify-patient`, { method });
  },
  onSuccess: () => {
    toast({ title: t("dischargeBriefs.notified", "Patient notified") });
    setNotifyMethod(null);
  },
  onError: (error: Error) => {
    toast({ title: t("dischargeBriefs.notifyError", "Failed to notify patient"), description: error.message, variant: "destructive" });
  },
});
```

- [ ] **Step 4: Add share button to brief card**

In the `renderBriefCard` function, add a share button after the Export PDF button and before the Audit button. Only show for signed briefs:

```typescript
{brief.isLocked && canWrite && (
  <Button
    size="sm"
    variant="ghost"
    onClick={() => setShareDialogBrief(brief)}
    title={t('dischargeBriefs.share', 'Share')}
    className={brief.portalVisible ? "text-green-600" : ""}
  >
    <Share2 className="h-4 w-4" />
  </Button>
)}
```

- [ ] **Step 5: Add share dialog**

Add the dialog JSX before the closing `</div>` of the component return, near other dialogs:

```tsx
{/* Share to portal dialog */}
<Dialog open={!!shareDialogBrief} onOpenChange={(open) => { if (!open) { setShareDialogBrief(null); setNotifyMethod(null); } }}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{t("dischargeBriefs.shareTitle", "Share Document")}</DialogTitle>
    </DialogHeader>
    {shareDialogBrief && (
      <div className="space-y-4 py-2">
        {!shareDialogBrief.portalVisible ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t("dischargeBriefs.shareConfirmation", "This document will be visible to the patient on their portal.")}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShareDialogBrief(null)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={() => shareMutation.mutate(shareDialogBrief.id)}
                disabled={shareMutation.isPending}
              >
                {shareMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("dischargeBriefs.shareToPortal", "Share to Portal")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Share2 className="h-4 w-4" />
              {t("dischargeBriefs.alreadyShared", "This document is visible on the patient portal.")}
            </div>

            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">{t("dischargeBriefs.notifyPatient", "Notify patient")}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => notifyMutation.mutate({ briefId: shareDialogBrief.id, method: "email" })}
                  disabled={notifyMutation.isPending}
                >
                  {notifyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("dischargeBriefs.notifyEmail", "Send Email")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => notifyMutation.mutate({ briefId: shareDialogBrief.id, method: "sms" })}
                  disabled={notifyMutation.isPending}
                >
                  {notifyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {t("dischargeBriefs.notifySms", "Send SMS")}
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => unshareMutation.mutate(shareDialogBrief.id)}
                disabled={unshareMutation.isPending}
              >
                {unshareMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("dischargeBriefs.unshare", "Remove from Portal")}
              </Button>
            </div>
          </>
        )}
      </div>
    )}
  </DialogContent>
</Dialog>
```

- [ ] **Step 6: Update DischargeBrief interface**

Check the `DischargeBrief` interface used in the component. It needs `portalVisible`, `portalSharedAt`, `portalSharedBy` fields. Find the interface definition (likely near the top of the file or in a shared types file) and add:

```typescript
portalVisible?: boolean;
portalSharedAt?: string | null;
portalSharedBy?: string | null;
```

- [ ] **Step 7: TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add client/src/components/shared/PatientDocumentsSection.tsx
git commit -m "feat: add share dialog with portal/email/sms actions on brief cards"
```

---

### Task 6: Patient Portal — Documents Section

**Files:**
- Modify: `client/src/pages/PatientPortal.tsx`

- [ ] **Step 1: Find where the surgery card ends**

Search for the surgery completed section or the area after the surgery card in `PatientPortal.tsx`. The documents section should appear after the surgery card, shown whenever there are shared documents (regardless of surgery status).

- [ ] **Step 2: Add shared briefs query**

Add a query near the other portal data queries:

```typescript
const { data: sharedBriefs = [] } = useQuery<
  { id: string; briefType: string; language: string; signedAt: string; signerName: string | null }[]
>({
  queryKey: [`/api/patient-portal/${token}/shared-briefs`],
  enabled: !!token && isVerified,
});
```

- [ ] **Step 3: Add download handler**

```typescript
const handleDownloadBrief = async (briefId: string) => {
  try {
    const res = await fetch(`/api/patient-portal/${token}/shared-briefs/${briefId}/download`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Download failed");
    const { downloadUrl } = await res.json();
    window.open(downloadUrl, "_blank");
  } catch (error) {
    // Show error toast or inline message
    console.error("Failed to download document:", error);
  }
};
```

- [ ] **Step 4: Add brief type labels (translated)**

```typescript
const BRIEF_TYPE_LABELS: Record<string, Record<string, string>> = {
  surgery_discharge: { de: "Austrittsbericht Chirurgie", en: "Surgery Discharge Brief", fr: "Rapport de sortie chirurgie", it: "Rapporto di dimissione chirurgia" },
  anesthesia_discharge: { de: "Austrittsbericht Anästhesie", en: "Anesthesia Discharge Brief", fr: "Rapport de sortie anesthésie", it: "Rapporto di dimissione anestesia" },
  anesthesia_overnight_discharge: { de: "Austrittsbericht Anästhesie + Übernachtung", en: "Anesthesia + Overnight Brief", fr: "Rapport anesthésie + nuitée", it: "Rapporto anestesia + pernottamento" },
  prescription: { de: "Rezept", en: "Prescription", fr: "Ordonnance", it: "Ricetta" },
  surgery_report: { de: "Operationsbericht", en: "Surgery Report", fr: "Rapport opératoire", it: "Rapporto operatorio" },
  surgery_estimate: { de: "Kostenvoranschlag", en: "Surgery Estimate", fr: "Devis chirurgical", it: "Preventivo chirurgico" },
  generic: { de: "Dokument", en: "Document", fr: "Document", it: "Documento" },
};
```

- [ ] **Step 5: Add Documents section JSX**

Add the section after the surgery card area. The portal uses its own language from portal data, so use that for labels:

```tsx
{sharedBriefs.length > 0 && (
  <div className="bg-white rounded-2xl shadow-sm border p-6">
    <h3 className="text-lg font-semibold mb-4">
      {portalData.language === "de" ? "Ihre Dokumente" :
       portalData.language === "fr" ? "Vos documents" :
       portalData.language === "it" ? "I vostri documenti" :
       "Your Documents"}
    </h3>
    <div className="space-y-3">
      {sharedBriefs.map((brief) => (
        <div
          key={brief.id}
          className="flex items-center justify-between p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="min-w-0">
            <p className="font-medium text-sm">
              {BRIEF_TYPE_LABELS[brief.briefType]?.[portalData.language] ||
               BRIEF_TYPE_LABELS[brief.briefType]?.de ||
               brief.briefType}
            </p>
            {brief.signerName && (
              <p className="text-xs text-gray-500 mt-1">
                {brief.signerName} — {new Date(brief.signedAt).toLocaleDateString(
                  portalData.language === "de" ? "de-CH" :
                  portalData.language === "fr" ? "fr-CH" :
                  portalData.language === "it" ? "it-CH" : "en-GB"
                )}
              </p>
            )}
          </div>
          <button
            onClick={() => handleDownloadBrief(brief.id)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {portalData.language === "de" ? "Herunterladen" :
             portalData.language === "fr" ? "Télécharger" :
             portalData.language === "it" ? "Scaricare" :
             "Download"}
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

Note: The portal uses its own styling (not shadcn/ui components). Match the existing portal card style (white cards with rounded corners, shadow-sm, border).

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/PatientPortal.tsx
git commit -m "feat: add Documents section to patient portal for shared briefs"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npm run check`
Expected: PASS with no errors

- [ ] **Step 2: Verify migration is idempotent**

Re-read the migration SQL file and confirm all statements use `IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... END $$` guards.

- [ ] **Step 3: Test end-to-end flow mentally**

Verify the data flow:
1. Staff signs brief → brief is locked with PDF
2. Staff clicks share icon → dialog opens → clicks "Share to Portal" → `POST /share` → `portalVisible = true`
3. Staff clicks "Send Email" → `POST /notify-patient` → patient gets email with portal link
4. Patient opens portal link → authenticates via OTP → portal loads
5. Portal fetches `GET /shared-briefs` → shows documents section
6. Patient clicks Download → `GET /shared-briefs/:id/download` → validates ownership + visibility → returns signed S3 URL → PDF opens

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "feat: portal document sharing - final adjustments"
```
