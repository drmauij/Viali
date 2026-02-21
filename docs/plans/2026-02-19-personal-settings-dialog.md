# Personal Settings Dialog — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Timebutler Sync" menu item with a "Personal Settings" dialog containing phone, brief signature, and Timebutler URL fields.

**Architecture:** Add `briefSignature` column to users table. Create a single `PATCH /api/user/profile` endpoint replacing the existing `PUT /api/user/timebutler-url`. Build a new `PersonalSettingsDialog` component and wire it into the TopBar menu, removing the old `TimebutlerUrlDialog`. Update PDF rendering to use `briefSignature` for the signer text block.

**Tech Stack:** React, Drizzle ORM, PostgreSQL, i18next, jsPDF

---

### Task 1: Schema — add `briefSignature` column

**Files:**
- Modify: `shared/schema.ts:48` (add column after `timebutlerIcsUrl`)
- Create: migration file via `npm run db:generate`

**Step 1: Add `briefSignature` to schema**

In `shared/schema.ts`, add after the `timebutlerIcsUrl` line (line 48):

```ts
briefSignature: text("brief_signature"), // Multi-line professional signature block for discharge briefs
```

**Step 2: Generate migration**

Run: `npm run db:generate`

**Step 3: Make migration idempotent**

Open the generated migration SQL file in `migrations/`. The generated `ALTER TABLE` will look like:

```sql
ALTER TABLE "users" ADD COLUMN "brief_signature" text;
```

Wrap it:

```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'brief_signature'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "brief_signature" text;
  END IF;
END $$;
```

**Step 4: Run migration**

Run: `npm run db:migrate`

**Step 5: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add briefSignature column to users table"
```

---

### Task 2: API — new `PATCH /api/user/profile` endpoint

**Files:**
- Modify: `server/routes/auth.ts:436-456` (replace `PUT /api/user/timebutler-url` with new endpoint)

**Step 1: Replace the timebutler-url endpoint with a profile endpoint**

In `server/routes/auth.ts`, replace lines 436-456 (the `PUT /api/user/timebutler-url` route) with:

```ts
// Update user profile fields (phone, briefSignature, timebutlerIcsUrl)
router.patch('/api/user/profile', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const profileSchema = z.object({
      phone: z.string().nullable().optional(),
      briefSignature: z.string().nullable().optional(),
      timebutlerIcsUrl: z.string().nullable().optional(),
    });

    const data = profileSchema.parse(req.body);

    // Validate Timebutler URL if provided
    if (data.timebutlerIcsUrl && !data.timebutlerIcsUrl.startsWith('https://')) {
      return res.status(400).json({ message: "Timebutler URL must use HTTPS" });
    }

    // Build update object with only provided fields
    const updateFields: Record<string, any> = { updatedAt: new Date() };
    if ('phone' in data) updateFields.phone = data.phone || null;
    if ('briefSignature' in data) updateFields.briefSignature = data.briefSignature || null;
    if ('timebutlerIcsUrl' in data) updateFields.timebutlerIcsUrl = data.timebutlerIcsUrl || null;

    await db.update(users)
      .set(updateFields)
      .where(eq(users.id, userId));

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid request", details: error.errors });
    }
    logger.error("Error updating user profile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});
```

Note: Import `ZodError` from `zod` at the top of the file if not already imported. Check the existing imports first — it's likely already there since `z` is used elsewhere in the file.

**Step 2: Verify the build compiles**

Run: `npm run check`

**Step 3: Commit**

```bash
git add server/routes/auth.ts
git commit -m "feat: add PATCH /api/user/profile endpoint replacing timebutler-url"
```

---

### Task 3: i18n — add translations

**Files:**
- Modify: `client/src/i18n/locales/en.json` (settings section, around line 6411)
- Modify: `client/src/i18n/locales/de.json` (settings section, around line 6431)

**Step 1: Add English translations**

In the `settings` object of `en.json`, add these keys (keep existing timebutler keys, add new ones):

```json
"personalSettings": "Personal Settings",
"personalSettingsDesc": "Update your personal information and integrations.",
"phone": "Phone Number",
"phonePlaceholder": "+41 79 123 45 67",
"briefSignature": "Brief Signature",
"briefSignaturePlaceholder": "Dr. M. Schmidt\nOberarzt Anästhesie",
"briefSignatureHint": "Multi-line signature block shown on discharge briefs when you sign them.",
"profileSaved": "Personal settings saved",
"profileError": "Failed to save personal settings"
```

**Step 2: Add German translations**

In the `settings` object of `de.json`, add:

```json
"personalSettings": "Persönliche Einstellungen",
"personalSettingsDesc": "Aktualisieren Sie Ihre persönlichen Informationen und Integrationen.",
"phone": "Telefonnummer",
"phonePlaceholder": "+41 79 123 45 67",
"briefSignature": "Brief-Unterschrift",
"briefSignaturePlaceholder": "Dr. M. Schmidt\nOberarzt Anästhesie",
"briefSignatureHint": "Mehrzeilige Unterschrift, die auf Austrittsbriefen angezeigt wird, wenn Sie diese unterschreiben.",
"profileSaved": "Persönliche Einstellungen gespeichert",
"profileError": "Persönliche Einstellungen konnten nicht gespeichert werden"
```

**Step 3: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add i18n translations for personal settings dialog"
```

---

### Task 4: UI — create `PersonalSettingsDialog` component

**Files:**
- Create: `client/src/components/PersonalSettingsDialog.tsx`
- Delete content from: `client/src/components/TimebutlerUrlDialog.tsx` (will be removed in Task 5)

**Step 1: Create the PersonalSettingsDialog component**

Create `client/src/components/PersonalSettingsDialog.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

interface PersonalSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string | null;
  currentBriefSignature?: string | null;
  currentTimebutlerUrl?: string | null;
}

export default function PersonalSettingsDialog({
  open,
  onOpenChange,
  currentPhone,
  currentBriefSignature,
  currentTimebutlerUrl,
}: PersonalSettingsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(currentPhone || "");
  const [briefSignature, setBriefSignature] = useState(currentBriefSignature || "");
  const [timebutlerUrl, setTimebutlerUrl] = useState(currentTimebutlerUrl || "");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(currentPhone || "");
      setBriefSignature(currentBriefSignature || "");
      setTimebutlerUrl(currentTimebutlerUrl || "");
    }
  }, [open, currentPhone, currentBriefSignature, currentTimebutlerUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (timebutlerUrl && !timebutlerUrl.startsWith("https://")) {
      toast({
        title: t("common.error"),
        description: t("settings.invalidUrl", "Please enter a valid HTTPS URL"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("PATCH", "/api/user/profile", {
        phone: phone || null,
        briefSignature: briefSignature || null,
        timebutlerIcsUrl: timebutlerUrl || null,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save");
      }

      // Invalidate user query so TopBar/other components pick up the new values
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: t("common.success"),
        description: t("settings.profileSaved", "Personal settings saved"),
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("settings.profileError", "Failed to save personal settings"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="personal-settings-dialog">
        <DialogHeader>
          <DialogTitle>{t("settings.personalSettings", "Personal Settings")}</DialogTitle>
          <DialogDescription>
            {t("settings.personalSettingsDesc", "Update your personal information and integrations.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phone */}
          <div>
            <Label htmlFor="personal-phone">{t("settings.phone", "Phone Number")}</Label>
            <Input
              id="personal-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("settings.phonePlaceholder", "+41 79 123 45 67")}
              data-testid="input-phone"
            />
          </div>

          {/* Brief Signature */}
          <div>
            <Label htmlFor="personal-brief-signature">{t("settings.briefSignature", "Brief Signature")}</Label>
            <Textarea
              id="personal-brief-signature"
              value={briefSignature}
              onChange={(e) => setBriefSignature(e.target.value)}
              placeholder={t("settings.briefSignaturePlaceholder", "Dr. M. Schmidt\nOberarzt Anästhesie")}
              rows={3}
              data-testid="input-brief-signature"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.briefSignatureHint", "Multi-line signature block shown on discharge briefs when you sign them.")}
            </p>
          </div>

          {/* Timebutler URL */}
          <div>
            <Label htmlFor="personal-timebutler-url">{t("settings.calendarUrl", "Calendar URL")}</Label>
            <Input
              id="personal-timebutler-url"
              type="url"
              value={timebutlerUrl}
              onChange={(e) => setTimebutlerUrl(e.target.value)}
              placeholder="https://cal.timebutler.de/calexport/..."
              data-testid="input-timebutler-url"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.timebutlerUrlHint", "Find this in Timebutler: Settings → Synchronize → Your sync URL")}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-save-profile">
            {isLoading ? t("common.saving", "Saving...") : t("common.save", "Save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify build**

Run: `npm run check`

**Step 3: Commit**

```bash
git add client/src/components/PersonalSettingsDialog.tsx
git commit -m "feat: create PersonalSettingsDialog component"
```

---

### Task 5: TopBar — wire up new dialog, remove old one

**Files:**
- Modify: `client/src/components/TopBar.tsx:7,39,326-337,359-363`
- Delete: `client/src/components/TimebutlerUrlDialog.tsx`

**Step 1: Update TopBar imports**

In `TopBar.tsx`, replace the import on line 7:

```ts
// REMOVE:
import TimebutlerUrlDialog from "./TimebutlerUrlDialog";
// ADD:
import PersonalSettingsDialog from "./PersonalSettingsDialog";
```

**Step 2: Rename state variable**

On line 39, rename `showTimebutlerUrl` to `showPersonalSettings`:

```ts
// CHANGE:
const [showTimebutlerUrl, setShowTimebutlerUrl] = useState(false);
// TO:
const [showPersonalSettings, setShowPersonalSettings] = useState(false);
```

**Step 3: Replace menu item (lines 326-337)**

Replace the "Timebutler Sync URL" button block with:

```tsx
{/* Personal Settings */}
<button
  className="w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground border-b border-border flex items-center gap-3"
  onClick={() => {
    setShowPersonalSettings(true);
    setShowUserMenu(false);
  }}
  data-testid="button-personal-settings"
>
  <i className="fas fa-user-cog w-4"></i>
  <span>{t('settings.personalSettings', 'Personal Settings')}</span>
</button>
```

**Step 4: Replace dialog instance (lines 359-363)**

Replace the `<TimebutlerUrlDialog>` block with:

```tsx
<PersonalSettingsDialog
  open={showPersonalSettings}
  onOpenChange={setShowPersonalSettings}
  currentPhone={(user as any)?.phone}
  currentBriefSignature={(user as any)?.briefSignature}
  currentTimebutlerUrl={(user as any)?.timebutlerIcsUrl}
/>
```

**Step 5: Delete old dialog**

Delete the file `client/src/components/TimebutlerUrlDialog.tsx`.

**Step 6: Verify no remaining references to TimebutlerUrlDialog**

Search codebase for `TimebutlerUrlDialog` — should find nothing.

**Step 7: Verify build**

Run: `npm run check`

**Step 8: Commit**

```bash
git add client/src/components/TopBar.tsx
git rm client/src/components/TimebutlerUrlDialog.tsx
git commit -m "feat: replace Timebutler Sync with Personal Settings in user menu"
```

---

### Task 6: PDF — use `briefSignature` in discharge brief PDF

**Files:**
- Modify: `server/routes/dischargeBriefs.ts:451-452` (pass `briefSignature` to PDF renderer)
- Modify: `server/utils/htmlToPdf.ts:9-18,313-317` (render multi-line `signedBy`)

**Step 1: Pass briefSignature from the signing route**

In `server/routes/dischargeBriefs.ts`, at lines 451-452, change the `signedBy` value to prefer `briefSignature`:

```ts
signedBy: brief.signer
  ? (brief.signer.briefSignature || `${brief.signer.firstName || ""} ${brief.signer.lastName || ""}`.trim())
  : undefined,
```

**Step 2: Update PDF renderer to handle multi-line signedBy**

In `server/utils/htmlToPdf.ts`, replace lines 313-317 (the `signedBy` rendering block):

```ts
if (opts.signedBy) {
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const lines = opts.signedBy.split("\n");
  for (const line of lines) {
    pdf.text(line, margin, state.y);
    state.y += 5;
  }
}
```

Also update the `checkNewPage` height estimate on line 294 to account for multi-line signatures — change `40` to `60`:

```ts
checkNewPage(pdf, 60, state);
```

**Step 3: Verify build**

Run: `npm run check`

**Step 4: Commit**

```bash
git add server/routes/dischargeBriefs.ts server/utils/htmlToPdf.ts
git commit -m "feat: use briefSignature in discharge brief PDF signing"
```

---

### Task 7: Verify everything works end-to-end

**Step 1: Run typecheck**

Run: `npm run check`

**Step 2: Run dev server and test manually**

Run: `npm run dev`

Verify:
- User menu shows "Personal Settings" instead of "Timebutler Sync"
- Dialog opens with three fields pre-filled from current user data
- Saving updates all three fields
- Signing a discharge brief uses the briefSignature text in the PDF

**Step 3: Final commit if any fixes needed**
