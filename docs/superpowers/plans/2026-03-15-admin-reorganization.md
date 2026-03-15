# Admin Area Reorganization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 6,567-line Hospital.tsx monolith into 3 focused pages (Settings, Clinical, Integrations), update navigation from 4 to 5 bottom nav items, and remove dead code (Cal.com, Vonage).

**Architecture:** Extract inline components from Hospital.tsx into individual files under `client/src/pages/admin/components/`. Create 3 new page files that import these components and own their respective state. Update routing, navigation, and billing lock paths. Delete Hospital.tsx and CameraDevices.tsx.

**Tech Stack:** React, TypeScript, wouter, shadcn/ui Tabs, tanstack/react-query, i18n (react-i18next)

**Spec:** `docs/superpowers/specs/2026-03-15-admin-reorganization-design.md`

---

## Chunk 1: Infrastructure — Routing, Navigation, i18n

### Task 1: Update i18n translation keys

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json` (if exists, otherwise whatever DE translation file is used)

- [ ] **Step 1: Add new nav label keys to EN translations**

In the `bottomNav.admin` section, replace the existing keys:

```json
"bottomNav": {
  "admin": {
    "settings": "Settings",
    "clinical": "Clinical",
    "users": "Users",
    "integrations": "Integrations",
    "billing": "Billing"
  }
}
```

- [ ] **Step 2: Add new nav label keys to DE translations**

```json
"bottomNav": {
  "admin": {
    "settings": "Einstellungen",
    "clinical": "Klinisch",
    "users": "Benutzer",
    "integrations": "Integrationen",
    "billing": "Abrechnung"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(admin): add i18n keys for new admin nav items"
```

---

### Task 2: Update BottomNav admin items and isActive logic

**Files:**
- Modify: `client/src/components/BottomNav.tsx:173-179` (admin nav items)
- Modify: `client/src/components/BottomNav.tsx:243-245` (isActive logic)

- [ ] **Step 1: Replace admin nav items**

Replace the current admin block (lines 173-179):

```typescript
if (activeModule === "admin") {
  return [
    { id: "admin-settings", icon: "fas fa-cog", label: t('bottomNav.admin.settings'), path: "/admin" },
    { id: "admin-clinical", icon: "fas fa-stethoscope", label: t('bottomNav.admin.clinical'), path: "/admin/clinical" },
    { id: "admin-users", icon: "fas fa-users", label: t('bottomNav.admin.users'), path: "/admin/users" },
    { id: "admin-integrations", icon: "fas fa-plug", label: t('bottomNav.admin.integrations'), path: "/admin/integrations" },
    { id: "admin-billing", icon: "fas fa-credit-card", label: t('bottomNav.admin.billing'), path: "/admin/billing" },
  ];
}
```

- [ ] **Step 2: Fix isActive logic for admin routes**

The current logic (lines 243-245) uses exact match for `/admin`:

```typescript
if (path === "/admin") {
  return location === "/admin";
}
```

This is correct — `/admin` should only highlight when on the Settings page (exact match). The other admin routes (`/admin/clinical`, `/admin/integrations`, etc.) will use the default `startsWith` matching at line 256. No change needed here.

- [ ] **Step 3: Verify and commit**

```bash
npm run check
git add client/src/components/BottomNav.tsx
git commit -m "feat(admin): update bottom nav to 5-item layout"
```

---

### Task 3: Update BillingLock allowed paths

**Files:**
- Modify: `client/src/components/BillingLock.tsx:32`

- [ ] **Step 1: Update allowedPaths array**

Replace:
```typescript
const allowedPaths = ["/admin/billing", "/admin", "/admin/users", "/admin/cameras"];
```

With:
```typescript
const allowedPaths = ["/admin/billing", "/admin", "/admin/users", "/admin/clinical", "/admin/integrations"];
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/BillingLock.tsx
git commit -m "fix(admin): update BillingLock allowed paths for new admin routes"
```

---

### Task 4: Update App.tsx routes and lazy imports

**Files:**
- Modify: `client/src/App.tsx:28-30` (lazy imports)
- Modify: `client/src/App.tsx:232-235` (route definitions)

- [ ] **Step 1: Replace lazy imports**

Replace:
```typescript
const AdminHospital = React.lazy(() => import("@/pages/admin/Hospital"));
const AdminUsers = React.lazy(() => import("@/pages/admin/Users"));
const AdminCameraDevices = React.lazy(() => import("@/pages/admin/CameraDevices"));
const AdminBilling = React.lazy(() => import("@/pages/admin/Billing"));
```

With:
```typescript
const AdminSettings = React.lazy(() => import("@/pages/admin/Settings"));
const AdminClinical = React.lazy(() => import("@/pages/admin/Clinical"));
const AdminUsers = React.lazy(() => import("@/pages/admin/Users"));
const AdminIntegrations = React.lazy(() => import("@/pages/admin/Integrations"));
const AdminBilling = React.lazy(() => import("@/pages/admin/Billing"));
```

- [ ] **Step 2: Replace route definitions**

Replace:
```typescript
<Route path="/admin">{() => <ProtectedRoute requireAdmin><AdminHospital /></ProtectedRoute>}</Route>
<Route path="/admin/users">{() => <ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>}</Route>
<Route path="/admin/cameras">{() => <ProtectedRoute requireAdmin><AdminCameraDevices /></ProtectedRoute>}</Route>
<Route path="/admin/billing">{() => <ProtectedRoute requireAdmin><AdminBilling /></ProtectedRoute>}</Route>
```

With:
```typescript
<Route path="/admin">{() => <ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>}</Route>
<Route path="/admin/clinical">{() => <ProtectedRoute requireAdmin><AdminClinical /></ProtectedRoute>}</Route>
<Route path="/admin/users">{() => <ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>}</Route>
<Route path="/admin/integrations">{() => <ProtectedRoute requireAdmin><AdminIntegrations /></ProtectedRoute>}</Route>
<Route path="/admin/billing">{() => <ProtectedRoute requireAdmin><AdminBilling /></ProtectedRoute>}</Route>
{/* Redirect old /admin/cameras route */}
<Route path="/admin/cameras">{() => { window.location.replace("/admin/integrations"); return null; }}</Route>
```

- [ ] **Step 3: Create stub page files so typecheck passes**

Create minimal stubs so App.tsx compiles. These will be replaced by real pages in later tasks.

```typescript
// client/src/pages/admin/Settings.tsx
export default function Settings() { return <div>Settings</div>; }

// client/src/pages/admin/Clinical.tsx
export default function Clinical() { return <div>Clinical</div>; }

// client/src/pages/admin/Integrations.tsx
export default function Integrations() { return <div>Integrations</div>; }
```

- [ ] **Step 4: Use wouter Redirect instead of window.location.replace**

For the `/admin/cameras` redirect, use wouter's `Redirect` component for a SPA-friendly redirect (no full page reload):

```typescript
import { Redirect } from "wouter";
// ...
<Route path="/admin/cameras">{() => <Redirect to="/admin/integrations" />}</Route>
```

- [ ] **Step 5: Verify and commit**

```bash
npm run check
git add client/src/App.tsx client/src/pages/admin/Settings.tsx client/src/pages/admin/Clinical.tsx client/src/pages/admin/Integrations.tsx
git commit -m "feat(admin): update routes for new admin page structure"
```

---

## Chunk 2: Extract Inline Components from Hospital.tsx

### Task 5: Extract TARDOC components

**Files:**
- Create: `client/src/pages/admin/components/TardocIntegrationCard.tsx`
- Create: `client/src/pages/admin/components/ChopIntegrationCard.tsx`
- Create: `client/src/pages/admin/components/ApIntegrationCard.tsx`
- Create: `client/src/pages/admin/components/CumulationRulesCard.tsx`
- Create: `client/src/pages/admin/components/TpwRatesCard.tsx`

- [ ] **Step 1: Create the `components/` directory**

```bash
mkdir -p client/src/pages/admin/components
```

- [ ] **Step 2: Extract TardocIntegrationCard**

Copy `TardocIntegrationCard` function (Hospital.tsx lines 5630-5732) to its own file. Add its own imports (React, useState, useTranslation, useMutation, apiRequest, queryClient, useToast, UI components). Export as named export:

```typescript
export function TardocIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from Hospital.tsx lines 5630-5732
}
```

- [ ] **Step 3: Extract ChopIntegrationCard**

Copy `ChopIntegrationCard` function (Hospital.tsx lines 6157-6247) to its own file with its own imports. Note: this component takes no props — it uses a hardcoded API endpoint.

```typescript
export function ChopIntegrationCard() {
  // ... existing code from Hospital.tsx lines 6157-6247
}
```

- [ ] **Step 4: Extract ApIntegrationCard**

Copy `ApIntegrationCard` function (Hospital.tsx lines 5733-5822) to its own file with its own imports.

```typescript
export function ApIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from Hospital.tsx lines 5733-5822
}
```

- [ ] **Step 5: Extract CumulationRulesCard**

Copy `CumulationRulesCard` function (Hospital.tsx lines 5823-5950) to its own file with its own imports.

```typescript
export function CumulationRulesCard({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from Hospital.tsx lines 5823-5950
}
```

- [ ] **Step 6: Extract TpwRatesCard**

Copy `TpwRatesCard` function (Hospital.tsx lines 5951-6156) to its own file with its own imports.

```typescript
export function TpwRatesCard({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from Hospital.tsx lines 5951-6156
}
```

- [ ] **Step 7: Verify all 5 components compile**

```bash
npm run check
```

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/admin/components/TardocIntegrationCard.tsx client/src/pages/admin/components/ChopIntegrationCard.tsx client/src/pages/admin/components/ApIntegrationCard.tsx client/src/pages/admin/components/CumulationRulesCard.tsx client/src/pages/admin/components/TpwRatesCard.tsx
git commit -m "refactor(admin): extract TARDOC components from Hospital.tsx"
```

---

### Task 6: Extract SMS and Supplier components

**Files:**
- Create: `client/src/pages/admin/components/SmsProviderSelector.tsx`
- Create: `client/src/pages/admin/components/AspsmsIntegrationCard.tsx`
- Create: `client/src/pages/admin/components/BookingTokenSection.tsx`

- [ ] **Step 1: Extract SmsProviderSelector**

Copy `SmsProviderSelector` function (Hospital.tsx lines 4939-4995) to its own file. It takes `{ hospitalId?: string }` and has its own query + mutation.

**Important:** Remove the Vonage `SelectItem` from the dropdown — since VonageIntegrationCard is being deleted, users should not be able to select a provider whose config UI no longer exists. Remove:
```typescript
<SelectItem value="vonage">Vonage only</SelectItem>
```

```typescript
export function SmsProviderSelector({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from Hospital.tsx lines 4939-4995
  // Remove the vonage SelectItem
}
```

- [ ] **Step 2: Extract AspsmsIntegrationCard**

Copy `AspsmsIntegrationCard` function (Hospital.tsx lines 4996-5312) to its own file. It takes `{ hospitalId?: string }` and has its own queries + mutations.

```typescript
export function AspsmsIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from Hospital.tsx lines 4996-5312
}
```

- [ ] **Step 3: Extract BookingTokenSection**

Copy `BookingTokenSection` function (Hospital.tsx lines 6252-6566) to its own file. It takes `{ hospitalId?: string; isAdmin: boolean }`.

```typescript
export function BookingTokenSection({ hospitalId, isAdmin }: { hospitalId?: string; isAdmin: boolean }) {
  // ... existing code from Hospital.tsx lines 6252-6566
}
```

- [ ] **Step 4: Verify all compile**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/admin/components/SmsProviderSelector.tsx client/src/pages/admin/components/AspsmsIntegrationCard.tsx client/src/pages/admin/components/BookingTokenSection.tsx
git commit -m "refactor(admin): extract SMS and booking components from Hospital.tsx"
```

---

### Task 7: Extract CameraDevices inline components

**Files:**
- Create: `client/src/pages/admin/components/VisionAiProviderCard.tsx`
- Create: `client/src/pages/admin/components/CardReaderTab.tsx`

- [ ] **Step 1: Extract VisionAiProviderCard**

Copy `VisionAiProviderCard` function (CameraDevices.tsx lines 19-127) to its own file.

```typescript
export function VisionAiProviderCard({ hospitalId, currentProvider }: { hospitalId?: string; currentProvider?: string }) {
  // ... existing code from CameraDevices.tsx lines 19-127
}
```

- [ ] **Step 2: Extract CardReaderTab**

Copy `CardReaderTab` function (CameraDevices.tsx lines 129-272) to its own file.

```typescript
export function CardReaderTab({ hospitalId }: { hospitalId?: string }) {
  // ... existing code from CameraDevices.tsx lines 129-272
}
```

- [ ] **Step 3: Verify and commit**

```bash
npm run check
git add client/src/pages/admin/components/VisionAiProviderCard.tsx client/src/pages/admin/components/CardReaderTab.tsx
git commit -m "refactor(admin): extract camera/card-reader components from CameraDevices.tsx"
```

---

## Chunk 3: Create Settings Page

### Task 8: Create Settings.tsx

**Files:**
- Create: `client/src/pages/admin/Settings.tsx`

This page takes the following from Hospital.tsx:
- **Tabs:** settings (company/closures/regional/runway sub-tabs), links, data, security, experimental
- **State:** `hospitalForm`, `hospitalDialogOpen`, `isUploadingLogo`, `closureDialogOpen`, `editingClosure`, `closureForm`, `deleteClosureId`, `seedDialogOpen`, `resetListsDialogOpen`, `resetListsConfirmText`, `linkCopied`, `externalSurgeryLinkCopied`, `notificationEmail` (+ its useEffect to sync from query data)
- **Queries:** `fullHospitalData`, `closures`, `questionnaireTokenData`, `externalSurgeryTokenData`, `kioskTokenData`
- **Mutations:** `updateHospitalMutation`, `closureMutation`, `deleteClosureMutation`, `seedHospitalMutation`, `resetListsMutation`
- **Imports:** `LoginAuditLogTab` from `./LoginAuditLog`, `BookingTokenSection` from `./components/BookingTokenSection`

- [ ] **Step 1: Create Settings.tsx with imports and state**

Create `client/src/pages/admin/Settings.tsx`. Copy all relevant imports from Hospital.tsx. Set up the component with all state variables listed above. Copy the relevant queries and mutations.

**Key change:** Fix the `fullHospitalData` query — remove the conditional `activeTab` check from `enabled`:

```typescript
const { data: fullHospitalData } = useQuery<any>({
  queryKey: [`/api/admin/${activeHospital?.id}`],
  enabled: !!activeHospital?.id && isAdmin,
});
```

This fixes the pre-existing bug where the Experimental tab could use stale defaults.

- [ ] **Step 2: Set up tab structure**

```typescript
const [activeTab, setActiveTab] = useState<"settings" | "links" | "data" | "security" | "experimental">("settings");
```

Use the same `Tabs` layout pattern from Hospital.tsx (vertical TabsList on desktop, horizontal scroll on mobile) but with only 5 tab triggers.

- [ ] **Step 3: Copy tab content — Settings sub-tabs**

Copy the entire `<TabsContent value="settings">` block (Hospital.tsx lines ~1291-1800) including the nested `<Tabs defaultValue="company">` with company, closures, general, runway sub-tabs.

- [ ] **Step 4: Copy tab content — Links, Data, Security, Experimental**

- Links: Copy `<TabsContent value="links">` (Hospital.tsx lines ~1803-2223) — includes `BookingTokenSection` import
- Data: Copy `<TabsContent value="data">` (Hospital.tsx lines ~2226-2307)
- Security: Copy `<TabsContent value="security">` (Hospital.tsx lines ~3100-3105)
- Experimental: Copy `<TabsContent value="experimental">` (Hospital.tsx lines ~3107-3136)

- [ ] **Step 5: Copy all dialogs**

Copy the closure dialog, seed dialog, reset lists dialog, and hospital edit dialog JSX blocks that are rendered at the bottom of the Hospital component.

- [ ] **Step 6: Copy all handler functions**

Copy handler functions used by Settings tabs: `handleSaveHospital`, logo upload handler, closure form handlers, seed/reset handlers, and any other functions referenced by the copied tab content.

- [ ] **Step 7: Export and verify**

```typescript
export default function Settings() { ... }
```

```bash
npm run check
```

Fix any TypeScript errors (missing imports, type mismatches).

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/admin/Settings.tsx
git commit -m "feat(admin): create Settings page (extracted from Hospital.tsx)"
```

---

## Chunk 4: Create Clinical Page

### Task 9: Create Clinical.tsx

**Files:**
- Create: `client/src/pages/admin/Clinical.tsx`

This page takes the following from Hospital.tsx:
- **Tabs:** units, rooms, checklists, templates
- **State:** `unitDialogOpen`, `editingUnit`, `unitForm`, `infoFlyerUploading`, `roomDialogOpen`, `editingRoom`, `roomFormName`, `roomFormType`, `templateDialogOpen`, `editingTemplate`, `templateForm`, `newTemplateItem`, `datePickerOpen`
- **Handlers:** `handleAddUnit`, `handleEditUnit`, `handleAddTemplate`, `handleEditTemplate`, `handleDuplicateTemplate`, `handleAddTemplateItem` (adds item from `newTemplateItem` to `templateForm.items`)
- **Queries:** `units`, `surgeryRooms`, `templates` (shared across tabs)
- **Mutations:** unit CRUD, room CRUD, checklist template CRUD
- **Constants:** `UNIT_TYPES` — copy for now (extract to shared file is a separate concern)

- [ ] **Step 1: Create Clinical.tsx with imports, state, queries, mutations**

Create `client/src/pages/admin/Clinical.tsx`. Copy relevant imports, state variables, queries, and mutations from Hospital.tsx.

```typescript
const [activeTab, setActiveTab] = useState<"units" | "rooms" | "checklists" | "templates">("units");
```

- [ ] **Step 2: Copy UNIT_TYPES constant**

```typescript
const UNIT_TYPES = [
  { value: "anesthesia", labelKey: "admin.unitTypes.anesthesia" },
  { value: "business", labelKey: "admin.unitTypes.business" },
  { value: "clinic", labelKey: "admin.unitTypes.clinic" },
  { value: "er", labelKey: "admin.unitTypes.er" },
  { value: "icu", labelKey: "admin.unitTypes.icu" },
  { value: "logistic", labelKey: "admin.unitTypes.logistic" },
  { value: "or", labelKey: "admin.unitTypes.or" },
  { value: "pharmacy", labelKey: "admin.unitTypes.pharmacy" },
  { value: "storage", labelKey: "admin.unitTypes.storage" },
  { value: "ward", labelKey: "admin.unitTypes.ward" },
] as const;
```

- [ ] **Step 3: Set up tab structure and copy tab content**

Use the same vertical TabsList layout. Copy:
- Units tab content (Hospital.tsx lines ~2310-2373)
- Rooms tab content (Hospital.tsx lines ~2376-2476)
- Checklists tab content (Hospital.tsx lines ~2480-2579)
- Templates tab content (Hospital.tsx lines ~2582-2592) — uses `DischargeBriefTemplateManager` with `units` prop

- [ ] **Step 4: Copy handler functions**

Copy: `handleAddUnit`, `handleEditUnit`, `handleAddTemplate`, `handleEditTemplate`, `handleDuplicateTemplate`, room form reset handler, and all mutation definitions for units, rooms, and checklist templates.

- [ ] **Step 5: Copy dialogs**

Copy the unit dialog, room dialog, and checklist template dialog JSX blocks.

- [ ] **Step 6: Export and verify**

```typescript
export default function Clinical() { ... }
```

```bash
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/admin/Clinical.tsx
git commit -m "feat(admin): create Clinical page (extracted from Hospital.tsx)"
```

---

## Chunk 5: Create Integrations Page

### Task 10: Create Integrations.tsx

**Files:**
- Create: `client/src/pages/admin/Integrations.tsx`

This page combines content from Hospital.tsx (suppliers, SMS, TARDOC) and CameraDevices.tsx (cameras, card reader).

- **Tabs:** galexis, sms, cameras, cardreader, tardoc
- **From Hospital.tsx suppliers tab:** supplier state (~10 vars), catalog queries, Galexis-specific content (simplified)
- **From Hospital.tsx integrations tab:** `SmsProviderSelector`, `AspsmsIntegrationCard` (skip Cal.com, Vonage)
- **From Hospital.tsx tardoc tab:** TARDOC component layout
- **From CameraDevices.tsx:** camera device state, queries, mutations, device list JSX

- [ ] **Step 1: Create Integrations.tsx with imports**

Import extracted components:
```typescript
import { SmsProviderSelector } from "./components/SmsProviderSelector";
import { AspsmsIntegrationCard } from "./components/AspsmsIntegrationCard";
import { TardocIntegrationCard } from "./components/TardocIntegrationCard";
import { ChopIntegrationCard } from "./components/ChopIntegrationCard";
import { ApIntegrationCard } from "./components/ApIntegrationCard";
import { CumulationRulesCard } from "./components/CumulationRulesCard";
import { TpwRatesCard } from "./components/TpwRatesCard";
import { VisionAiProviderCard } from "./components/VisionAiProviderCard";
import { CardReaderTab } from "./components/CardReaderTab";
```

- [ ] **Step 2: Set up tab structure**

```typescript
const [activeTab, setActiveTab] = useState<"galexis" | "sms" | "cameras" | "cardreader" | "tardoc">("galexis");
```

- [ ] **Step 3: Build Galexis tab**

Simplified from the full supplier tab. Migrate these specific items from Hospital.tsx:

**State variables to copy:**
- `supplierDialogOpen`, `supplierForm` (lines 107-113) — simplified to Galexis-only config
- `catalogFile`, `catalogPreview`, `catalogMapping`, `catalogImporting`, `catalogParsing`, `catalogSyncing`, `showMappingDialog` (lines 116-122)
- `galexisDebugQuery`, `galexisDebugResult`, `galexisDebugLoading` (lines 133-135)

**Queries to copy:**
- `catalogStatus` query (line 124) — `/api/admin/catalog/status`
- `priceSyncJobs` query (line 232) — `/api/price-sync-jobs/${hospitalId}` with refetch polling
- `supplierCatalogs` query (line 226) — `/api/supplier-catalogs/${hospitalId}`

**Handlers to copy:**
- `handleCatalogSync` (line 750) — POST `/api/admin/catalog/sync-items/${hospitalId}`
- CSV file parse handler
- Catalog mapping submit handler
- Galexis debug search handler

**Dialogs to copy:**
- Supplier config dialog (Hospital.tsx lines ~3235-3315) — simplify to Galexis-only (remove supplier type selector, default to Galexis)
- CSV mapping dialog (Hospital.tsx lines ~4122-4215) — catalog column mapping UI

**JSX to copy:**
- Product catalog card (catalog status, upload, sync)
- Galexis API config card (customer number, API password)
- Sync jobs status list
- Galexis debug search section

**Remove:** Generic "Add Supplier" button label (rename to "Configure Galexis"), multi-supplier catalog listing, supplier type dropdown.

- [ ] **Step 4: Build SMS tab**

```tsx
<TabsContent value="sms">
  <div className="space-y-4">
    <SmsProviderSelector hospitalId={activeHospital?.id} />
    <AspsmsIntegrationCard hospitalId={activeHospital?.id} />
  </div>
</TabsContent>
```

No Cal.com, no Vonage.

- [ ] **Step 5: Build Cameras tab**

Copy camera device CRUD from CameraDevices.tsx (lines 273-570):
- Camera device state: `dialogOpen`, `editingDevice`, `deleteDialogOpen`, `deletingDevice`, `copiedId`, `form`
- Queries: camera devices list
- Mutations: create, update, delete
- Camera list JSX with status indicators
- `VisionAiProviderCard` component
- Camera dialog and delete dialog

- [ ] **Step 6: Build Card Reader tab**

```tsx
<TabsContent value="cardreader">
  <CardReaderTab hospitalId={activeHospital?.id} />
</TabsContent>
```

- [ ] **Step 7: Build TARDOC tab**

Copy from Hospital.tsx lines 3065-3097. **Important:** The original has a `setActiveTab("settings")` button that navigates to the Settings tab within the same page — this must be changed to navigate to `/admin` (the Settings page) using wouter's `useLocation`:

```tsx
const [, navigate] = useLocation();
// ...
<TabsContent value="tardoc">
  <div className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold text-foreground">TARDOC</h2>
      <p className="text-sm text-muted-foreground">{t("admin.tardocTabDescription", "Swiss tariff catalogs, procedure codes, and billing configuration.")}</p>
    </div>
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-medium mb-3">{t("admin.tardocBillingIds", "Billing Identifiers")}</h3>
      <p className="text-sm text-muted-foreground mb-3">{t("admin.tardocBillingIdsDesc", "GLN, ZSR, and bank details are configured in Settings → Company.")}</p>
      <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
        <i className="fas fa-arrow-right mr-2"></i>
        {t("admin.goToCompanySettings", "Go to Company Settings")}
      </Button>
    </div>
    <TardocIntegrationCard hospitalId={activeHospital?.id} />
    <ChopIntegrationCard />
    <ApIntegrationCard hospitalId={activeHospital?.id} />
    <CumulationRulesCard hospitalId={activeHospital?.id} />
    <TpwRatesCard hospitalId={activeHospital?.id} />
  </div>
</TabsContent>
```

- [ ] **Step 8: Export and verify**

```typescript
export default function Integrations() { ... }
```

```bash
npm run check
```

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/admin/Integrations.tsx
git commit -m "feat(admin): create Integrations page (from Hospital.tsx + CameraDevices.tsx)"
```

---

## Chunk 6: Cleanup and Verification

### Task 11: Delete old files

**Files:**
- Delete: `client/src/pages/admin/Hospital.tsx`
- Delete: `client/src/pages/admin/CameraDevices.tsx`

- [ ] **Step 1: Verify new pages are wired up**

```bash
npm run check
```

All 3 new pages should be importable from App.tsx. If typecheck passes, the old files are safe to delete.

- [ ] **Step 2: Delete Hospital.tsx and CameraDevices.tsx**

```bash
rm client/src/pages/admin/Hospital.tsx client/src/pages/admin/CameraDevices.tsx
```

- [ ] **Step 3: Verify no broken imports**

```bash
npm run check
```

If anything references the old files, fix those imports.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor(admin): remove Hospital.tsx and CameraDevices.tsx (replaced by Settings, Clinical, Integrations)"
```

---

### Task 12: Full verification

- [ ] **Step 1: TypeScript check**

```bash
npm run check
```

Must pass clean.

- [ ] **Step 2: Manual smoke test**

Start dev server (`npm run dev`) and verify:

1. Bottom nav shows 5 items: Settings, Clinical, Users, Integrations, Billing
2. `/admin` → Settings page with 5 tabs (settings sub-tabs, links, data, security, experimental)
3. `/admin/clinical` → Clinical page with 4 tabs (units, rooms, checklists, templates)
4. `/admin/users` → Users page (unchanged, 2 tabs)
5. `/admin/integrations` → Integrations page with 5 tabs (galexis, sms, cameras, card reader, tardoc)
6. `/admin/billing` → Billing page (unchanged)
7. `/admin/cameras` → Redirects to `/admin/integrations`
8. Each nav item highlights correctly when active
9. Company form saves correctly
10. Experimental toggle (addonPatientChat) saves correctly
11. At least one CRUD operation works per page (e.g., create/edit a unit on Clinical)

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
npm run check
git add -A
git commit -m "fix(admin): post-reorganization fixes"
```
