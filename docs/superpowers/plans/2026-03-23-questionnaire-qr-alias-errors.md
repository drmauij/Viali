# Questionnaire QR Codes, URL Aliases, and Error Handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QR code downloads for admin links, a short URL alias system (`/q/{alias}`) for the open questionnaire, and proper error handling on questionnaire submission.

**Architecture:** Three independent features. (1) Client-side QR PNG generation using existing `qrcode` package. (2) New `questionnaireAlias` column on `hospitals` table with CRUD endpoints and a public alias resolver. (3) `onError` callback on the submit mutation with Sentry capture.

**Tech Stack:** React, wouter, TanStack Query, Express, Drizzle ORM (PostgreSQL), `qrcode` npm package, `@sentry/react`, jsPDF

**Spec:** `docs/superpowers/specs/2026-03-23-questionnaire-qr-alias-errors-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `shared/schema.ts:97` | Modify | Add `questionnaireAlias` column to `hospitals` |
| `server/storage/hospitals.ts:60-75` | Modify | Add alias storage functions |
| `server/storage.ts:224,1106` | Modify | Wire alias functions into IStorage interface + DatabaseStorage class |
| `server/routes/admin.ts:1261` | Modify | Add alias CRUD endpoints after questionnaire-token endpoints |
| `server/routes/questionnaire.ts:972` | Modify | Add public alias resolution endpoint |
| `client/src/App.tsx:168` | Modify | Add `/q/:alias` route |
| `client/src/pages/PatientQuestionnaire.tsx:1311-1324` | Modify | Add `onError` + Sentry, support alias loading |
| `client/src/pages/admin/Settings.tsx:1407,1532` | Modify | Add QR download buttons, alias management UI, prefer alias URL for poster |
| `client/src/pages/QuestionnaireAliasResolver.tsx` | Create | Wrapper component to resolve alias → token |
| `migrations/XXXX_add_questionnaire_alias.sql` | Create | Idempotent migration for new column |

---

## Task 1: Questionnaire Submission Error Handling

Fixes the patient-facing black screen on failed submission. Highest priority — shipping first.

**Files:**
- Modify: `client/src/pages/PatientQuestionnaire.tsx:1311-1324`

- [ ] **Step 1: Add Sentry import**

At the top of `client/src/pages/PatientQuestionnaire.tsx`, add:

```typescript
import * as Sentry from "@sentry/react";
```

- [ ] **Step 2: Add submit error state**

Near line 1099 (alongside other state declarations), add:

```typescript
const [submitError, setSubmitError] = useState(false);
```

- [ ] **Step 3: Add `onError` to submitMutation**

Replace the `submitMutation` definition (lines 1311-1324):

```typescript
const submitMutation = useMutation({
  mutationFn: async (data: FormData) => {
    const res = await fetch(`/api/public/questionnaire/${activeToken}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      throw new Error(`Failed to submit: ${res.status} ${errorText}`);
    }
    return res.json();
  },
  onSuccess: () => setIsSubmitted(true),
  onError: (error: Error) => {
    setSubmitError(true);
    Sentry.captureException(error, {
      tags: { component: 'questionnaire-submit' },
      extra: { token: activeToken },
    });
  },
});
```

- [ ] **Step 4: Clear error on retry**

In the `handleSubmit` callback (line 1482-1487), add `setSubmitError(false)` before mutate:

```typescript
const handleSubmit = useCallback(() => {
  if (!formData.patientPhone) {
    return;
  }
  setSubmitError(false);
  submitMutation.mutate(formData);
}, [formData, submitMutation]);
```

- [ ] **Step 5: Add error translations**

Add the following keys to each language's translation object inline in the file:

English (around line 385):
```typescript
"questionnaire.error.submitFailed": "Submission failed. Please check your internet connection and try again.",
```

German (around line 560):
```typescript
"questionnaire.error.submitFailed": "Senden fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
```

Italian (around line 735):
```typescript
"questionnaire.error.submitFailed": "Invio non riuscito. Verifichi la connessione internet e riprovi.",
```

Spanish (around line 910):
```typescript
"questionnaire.error.submitFailed": "Error al enviar. Por favor verifique su conexión a internet e inténtelo de nuevo.",
```

French (around line 1085):
```typescript
"questionnaire.error.submitFailed": "Échec de l'envoi. Veuillez vérifier votre connexion internet et réessayer.",
```

- [ ] **Step 6: Add error Alert UI**

In the submit step rendering (around line 3384, after the privacy required alert), add:

```tsx
{submitError && (
  <Alert variant="destructive" className="mt-4">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      {t("questionnaire.error.submitFailed")}
    </AlertDescription>
  </Alert>
)}
```

- [ ] **Step 7: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/PatientQuestionnaire.tsx
git commit -m "fix: add error handling and Sentry capture for questionnaire submission"
```

---

## Task 2: QR Code Downloads for External Surgery and Kiosk Links

**Files:**
- Modify: `client/src/pages/admin/Settings.tsx:1407,1532`

- [ ] **Step 1: Add QR code import**

At the top of `client/src/pages/admin/Settings.tsx`, add:

```typescript
import QRCode from "qrcode";
```

Also add `Download` to the lucide-react imports if not already present.

- [ ] **Step 2: Add QR download helper function**

Inside the Settings component (near the other helper functions around line 524), add:

```typescript
const downloadQrCode = async (url: string, filename: string) => {
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    width: 400,
    margin: 2,
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
};
```

- [ ] **Step 3: Add QR button to External Surgery section**

After the "Disable Link" button (line 1407), before the closing `</div>`, add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    const url = getExternalSurgeryUrl();
    if (url) downloadQrCode(url, 'external-surgery-qr-code.png');
  }}
  data-testid="button-download-external-surgery-qr"
>
  <Download className="h-4 w-4 mr-2" />
  {t("admin.downloadQrCode", "Download QR Code")}
</Button>
```

- [ ] **Step 4: Add QR button to Kiosk section**

After the kiosk "Disable Link" button (line 1532), before the closing `</div>`, add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    const url = getKioskUrl();
    if (url) downloadQrCode(url, 'kiosk-qr-code.png');
  }}
  data-testid="button-download-kiosk-qr"
>
  <Download className="h-4 w-4 mr-2" />
  {t("admin.downloadQrCode", "Download QR Code")}
</Button>
```

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/admin/Settings.tsx
git commit -m "feat: add QR code download buttons for external surgery and kiosk links"
```

---

## Task 3: Schema + Migration for Questionnaire Alias

**Files:**
- Modify: `shared/schema.ts:97`
- Create: `migrations/XXXX_add_questionnaire_alias.sql`

- [ ] **Step 1: Add column to schema**

In `shared/schema.ts`, after line 97 (`questionnaireToken`), add:

```typescript
questionnaireAlias: varchar("questionnaire_alias").unique(), // Short URL alias for questionnaire (e.g. /q/praxis-mueller)
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 3: Make migration idempotent**

Open the generated migration SQL file. Replace its content with idempotent SQL:

```sql
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "questionnaire_alias" varchar UNIQUE;
```

If Drizzle generates a `CREATE UNIQUE INDEX` separately, make it idempotent too:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "hospitals_questionnaire_alias_unique" ON "hospitals" USING btree ("questionnaire_alias");
```

- [ ] **Step 4: Verify journal timestamp**

Check `migrations/meta/_journal.json` — the new entry's `when` value must be higher than all previous entries. If not, manually adjust it.

- [ ] **Step 5: Push migration**

Run: `npm run db:migrate`
Expected: "Changes applied" or migration runs successfully

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add questionnaire_alias column to hospitals table"
```

---

## Task 4: Backend — Alias Storage Functions

**Files:**
- Modify: `server/storage/hospitals.ts:66-75`

- [ ] **Step 1: Add alias storage functions**

After `setHospitalQuestionnaireToken` (line 75), add:

```typescript
export async function getHospitalByQuestionnaireAlias(alias: string): Promise<Hospital | undefined> {
  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.questionnaireAlias, alias.toLowerCase()));
  return hospital;
}

export async function setHospitalQuestionnaireAlias(hospitalId: string, alias: string | null): Promise<Hospital> {
  const [updated] = await db
    .update(hospitals)
    .set({ questionnaireAlias: alias ? alias.toLowerCase() : null, updatedAt: new Date() })
    .where(eq(hospitals.id, hospitalId))
    .returning();
  return updated;
}

export async function checkQuestionnaireAliasAvailable(alias: string, excludeHospitalId?: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(eq(hospitals.questionnaireAlias, alias.toLowerCase()));
  if (!existing) return true;
  return excludeHospitalId ? existing.id === excludeHospitalId : false;
}
```

- [ ] **Step 2: Wire into IStorage interface**

In `server/storage.ts`, after line 224 (`setHospitalQuestionnaireToken`), add to the `IStorage` interface:

```typescript
getHospitalByQuestionnaireAlias(alias: string): Promise<Hospital | undefined>;
setHospitalQuestionnaireAlias(hospitalId: string, alias: string | null): Promise<Hospital>;
checkQuestionnaireAliasAvailable(alias: string, excludeHospitalId?: string): Promise<boolean>;
```

- [ ] **Step 3: Wire into DatabaseStorage class**

In `server/storage.ts`, after line 1106 (`setHospitalQuestionnaireToken`), add to the `DatabaseStorage` class:

```typescript
getHospitalByQuestionnaireAlias = hospitalStorage.getHospitalByQuestionnaireAlias;
setHospitalQuestionnaireAlias = hospitalStorage.setHospitalQuestionnaireAlias;
checkQuestionnaireAliasAvailable = hospitalStorage.checkQuestionnaireAliasAvailable;
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add server/storage/hospitals.ts server/storage.ts
git commit -m "feat: add questionnaire alias storage functions"
```

---

## Task 5: Backend — Admin Alias CRUD Endpoints

**Files:**
- Modify: `server/routes/admin.ts:1261`

- [ ] **Step 1: Add alias validation regex**

Near the top of `server/routes/admin.ts` (after imports), add:

```typescript
const ALIAS_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
```

- [ ] **Step 2: Add alias endpoints**

After the delete questionnaire-token endpoint (line 1261), add:

```typescript
// Questionnaire alias management
router.get('/api/admin/:hospitalId/questionnaire-alias', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    res.json({ questionnaireAlias: hospital.questionnaireAlias || null });
  } catch (error) {
    logger.error("Error fetching questionnaire alias:", error);
    res.status(500).json({ message: "Failed to fetch questionnaire alias" });
  }
});

router.get('/api/admin/:hospitalId/questionnaire-alias/check', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const alias = (req.query.alias as string || '').toLowerCase().trim();
    if (!alias || !ALIAS_REGEX.test(alias)) {
      return res.json({ available: false, reason: "invalid_format" });
    }
    const available = await storage.checkQuestionnaireAliasAvailable(alias, hospitalId);
    res.json({ available });
  } catch (error) {
    logger.error("Error checking questionnaire alias:", error);
    res.status(500).json({ message: "Failed to check alias availability" });
  }
});

router.put('/api/admin/:hospitalId/questionnaire-alias', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const alias = (req.body.alias as string || '').toLowerCase().trim();
    if (!alias || !ALIAS_REGEX.test(alias)) {
      return res.status(400).json({ message: "Invalid alias format. Use 3-50 characters: lowercase letters, numbers, and hyphens. Must start and end with a letter or number." });
    }
    const available = await storage.checkQuestionnaireAliasAvailable(alias, hospitalId);
    if (!available) {
      return res.status(409).json({ message: "This alias is already taken" });
    }
    const hospital = await storage.setHospitalQuestionnaireAlias(hospitalId, alias);
    res.json({ questionnaireAlias: hospital.questionnaireAlias });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: "This alias is already taken" });
    }
    logger.error("Error setting questionnaire alias:", error);
    res.status(500).json({ message: "Failed to set questionnaire alias" });
  }
});

router.delete('/api/admin/:hospitalId/questionnaire-alias', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    await storage.setHospitalQuestionnaireAlias(hospitalId, null);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting questionnaire alias:", error);
    res.status(500).json({ message: "Failed to delete questionnaire alias" });
  }
});
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/admin.ts
git commit -m "feat: add admin CRUD endpoints for questionnaire alias"
```

---

## Task 6: Backend — Public Alias Resolution Endpoint

**Files:**
- Modify: `server/routes/questionnaire.ts:972`

- [ ] **Step 1: Add alias resolution endpoint**

Before the existing hospital token route (line 972), add:

```typescript
// Resolve questionnaire alias to hospital token (public)
router.get('/api/public/questionnaire/by-alias/:alias', hospitalLinkFetchLimiter, async (req: Request, res: Response) => {
  try {
    const { alias } = req.params;

    if (!alias || alias.length < 3) {
      return res.status(400).json({ error: "invalid_alias" });
    }

    const hospital = await storage.getHospitalByQuestionnaireAlias(alias.toLowerCase());
    if (!hospital) {
      return res.status(404).json({ error: "not_found" });
    }

    if (!hospital.questionnaireToken) {
      return res.status(404).json({ error: "questionnaire_disabled" });
    }

    if (hospital.questionnaireDisabled) {
      return res.status(404).json({ error: "questionnaire_disabled" });
    }

    res.json({ token: hospital.questionnaireToken });
  } catch (error) {
    logger.error("Error resolving questionnaire alias:", error);
    res.status(500).json({ error: "server_error" });
  }
});
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add server/routes/questionnaire.ts
git commit -m "feat: add public alias resolution endpoint for questionnaire"
```

---

## Task 7: Frontend — `/q/:alias` Route and PatientQuestionnaire Alias Support

**Files:**
- Modify: `client/src/App.tsx:168`
- Modify: `client/src/pages/PatientQuestionnaire.tsx:1097-1114`

- [ ] **Step 1: Add `/q/:alias` route**

In `client/src/App.tsx`, add a new route near line 168 (before or after the existing questionnaire routes):

```tsx
<Route path="/q/:alias" component={QuestionnaireAliasResolver} />
```

Add the lazy import near line 73:

```typescript
const QuestionnaireAliasResolver = React.lazy(() => import("@/pages/QuestionnaireAliasResolver"));
```

- [ ] **Step 2: Create the alias resolver page**

Create `client/src/pages/QuestionnaireAliasResolver.tsx`:

```tsx
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import PatientQuestionnaire from "./PatientQuestionnaire";

export default function QuestionnaireAliasResolver() {
  const { alias } = useParams<{ alias: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/public/questionnaire/by-alias', alias],
    queryFn: async () => {
      const res = await fetch(`/api/public/questionnaire/by-alias/${alias}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'not_found');
      }
      return res.json() as Promise<{ token: string }>;
    },
    enabled: !!alias,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data?.token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Questionnaire not available</h1>
          <p className="text-gray-600">
            This questionnaire link is not active. Please contact your clinic for assistance.
          </p>
        </div>
      </div>
    );
  }

  return <PatientQuestionnaire resolvedToken={data.token} isHospitalLink />;
}
```

- [ ] **Step 3: Add `resolvedToken` prop to PatientQuestionnaire**

In `client/src/pages/PatientQuestionnaire.tsx`, update the component to accept an optional prop.

Near line 1093 (component definition), change:

```typescript
export default function PatientQuestionnaire() {
```

to:

```typescript
export default function PatientQuestionnaire({ resolvedToken, isHospitalLink }: { resolvedToken?: string; isHospitalLink?: boolean } = {}) {
```

Then update the token derivation (around line 1097-1099):

```typescript
const { token: urlToken } = useParams<{ token: string }>();
const token = resolvedToken || urlToken;
const [, setLocation] = useLocation();
const location = window.location.pathname;
const isHospitalToken = isHospitalLink || location.includes('/questionnaire/hospital/');
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/QuestionnaireAliasResolver.tsx client/src/App.tsx client/src/pages/PatientQuestionnaire.tsx
git commit -m "feat: add /q/:alias route with alias resolution for questionnaire"
```

---

## Task 8: Admin UI — Alias Management

**Files:**
- Modify: `client/src/pages/admin/Settings.tsx:1130-1228`

- [ ] **Step 1: Add alias state and queries**

In the Settings component, near the other questionnaire-related queries (around line 105), add:

```typescript
const { data: aliasData } = useQuery({
  queryKey: [`/api/admin/${activeHospital?.id}/questionnaire-alias`],
  queryFn: async () => {
    const res = await apiRequest("GET", `/api/admin/${activeHospital?.id}/questionnaire-alias`);
    return res.json();
  },
  enabled: !!activeHospital?.id,
});
```

Add state for the alias input (near other state declarations):

```typescript
const [aliasInput, setAliasInput] = useState("");
const [aliasAvailable, setAliasAvailable] = useState<boolean | null>(null);
const [aliasChecking, setAliasChecking] = useState(false);
```

- [ ] **Step 2: Add alias mutations**

Near the other questionnaire mutations, add:

```typescript
const setAliasMutation = useMutation({
  mutationFn: async (alias: string) => {
    const res = await apiRequest("PUT", `/api/admin/${activeHospital?.id}/questionnaire-alias`, { alias });
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/questionnaire-alias`] });
    toast({ title: t("common.success"), description: "Alias saved" });
    setAliasInput("");
    setAliasAvailable(null);
  },
  onError: (error: any) => {
    toast({ title: t("common.error"), description: error.message || "Failed to save alias", variant: "destructive" });
  },
});

const deleteAliasMutation = useMutation({
  mutationFn: async () => {
    await apiRequest("DELETE", `/api/admin/${activeHospital?.id}/questionnaire-alias`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/${activeHospital?.id}/questionnaire-alias`] });
    toast({ title: t("common.success"), description: "Alias removed" });
  },
});
```

- [ ] **Step 3: Add debounced alias availability check**

```typescript
const checkAliasAvailability = useCallback(async (alias: string) => {
  if (alias.length < 3) {
    setAliasAvailable(null);
    return;
  }
  setAliasChecking(true);
  try {
    const res = await apiRequest("GET", `/api/admin/${activeHospital?.id}/questionnaire-alias/check?alias=${encodeURIComponent(alias)}`);
    const data = await res.json();
    setAliasAvailable(data.available);
  } catch {
    setAliasAvailable(null);
  } finally {
    setAliasChecking(false);
  }
}, [activeHospital?.id]);

// Debounced check
useEffect(() => {
  if (!aliasInput || aliasInput.length < 3) {
    setAliasAvailable(null);
    return;
  }
  const timer = setTimeout(() => checkAliasAvailability(aliasInput), 500);
  return () => clearTimeout(timer);
}, [aliasInput, checkAliasAvailability]);
```

- [ ] **Step 4: Add alias URL helper**

Near `getQuestionnaireUrl` (line 524):

```typescript
const getQuestionnaireAliasUrl = () => {
  if (!aliasData?.questionnaireAlias) return null;
  const baseUrl = window.location.origin;
  return `${baseUrl}/q/${aliasData.questionnaireAlias}`;
};
```

- [ ] **Step 5: Add alias management UI**

In the questionnaire link section, after the buttons div (line 1205, before `</div>`), add the alias UI:

```tsx
{/* Alias URL */}
<div className="border-t border-border pt-3 space-y-2">
  <Label className="text-sm font-medium">
    {t("admin.questionnaireAlias", "Short URL Alias")}
  </Label>
  <p className="text-xs text-muted-foreground">
    {t("admin.questionnaireAliasDescription", "Set a short, memorable URL for patients (e.g. /q/your-clinic-name)")}
  </p>

  {aliasData?.questionnaireAlias ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
        <Input
          value={getQuestionnaireAliasUrl() || ""}
          readOnly
          className="flex-1 bg-background text-sm font-mono"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const url = getQuestionnaireAliasUrl();
            if (url) {
              await navigator.clipboard.writeText(url);
              toast({ title: t("common.success"), description: "Alias URL copied" });
            }
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/50 hover:bg-destructive/10"
          onClick={() => {
            if (confirm(t("admin.deleteAliasConfirm", "Remove this alias? The short URL will stop working."))) {
              deleteAliasMutation.mutate();
            }
          }}
          disabled={deleteAliasMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">/q/</span>
        <Input
          value={aliasInput}
          onChange={(e) => setAliasInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="your-clinic-name"
          className="pl-10 text-sm font-mono"
          maxLength={50}
        />
        {aliasChecking && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {!aliasChecking && aliasAvailable === true && aliasInput.length >= 3 && (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
        {!aliasChecking && aliasAvailable === false && (
          <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
        )}
      </div>
      <Button
        size="sm"
        onClick={() => setAliasMutation.mutate(aliasInput)}
        disabled={!aliasAvailable || aliasInput.length < 3 || setAliasMutation.isPending}
      >
        {setAliasMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : null}
        {t("common.save", "Save")}
      </Button>
    </div>
  )}
</div>
```

- [ ] **Step 6: Add missing imports**

Add `useCallback` to the React import at the top of the file (alongside existing `useState`, `useEffect`).

Ensure `Loader2`, `Check`, `X`, `Copy`, `Trash2`, `Download` are in the lucide-react imports (most are likely already there — only add missing ones).

- [ ] **Step 7: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/admin/Settings.tsx
git commit -m "feat: add alias management UI in admin settings"
```

---

## Task 9: QR Poster Prefers Alias URL

**Files:**
- Modify: `client/src/pages/admin/Settings.tsx:1191-1198`

- [ ] **Step 1: Update poster call in Settings**

In `client/src/pages/admin/Settings.tsx`, update the QR poster button click handler (around line 1191-1198) to prefer the alias URL:

```typescript
onClick={async () => {
  const url = getQuestionnaireAliasUrl() || getQuestionnaireUrl();
  if (!url) return;
  await generateQuestionnairePosterPdf({
    questionnaireUrl: url,
    hospitalName: hospitalForm.name || activeHospital?.name || "",
    companyLogoUrl: hospitalForm.companyLogoUrl || undefined,
  });
}}
```

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/Settings.tsx
git commit -m "feat: use alias URL in questionnaire QR poster when available"
```

---

## Task 10: Final Verification

- [ ] **Step 1: TypeScript check**

Run: `npm run check`
Expected: Clean pass

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual test checklist**

1. Admin → Settings → Links: verify QR download buttons for external surgery and kiosk
2. Set a questionnaire alias, verify availability check works
3. Visit `/q/{alias}` — verify questionnaire loads
4. Visit `/q/nonexistent` — verify friendly error page
5. Submit a questionnaire with network disconnected — verify error Alert shows
6. Reconnect and retry — verify submission succeeds
7. Check Sentry for captured errors
8. Download QR poster — verify it uses alias URL when set

- [ ] **Step 4: Verify migration is idempotent**

Run: `npm run db:migrate` a second time
Expected: No errors (migration is safe to re-run)
