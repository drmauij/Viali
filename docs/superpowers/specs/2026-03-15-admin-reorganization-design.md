# Admin Area Reorganization

**Date:** 2026-03-15

## Context

The admin area has 4 bottom nav items but 40+ features, with the bulk crammed into `Hospital.tsx` — a 6,567-line monolith with 13 tabs, ~40 state variables, and 10 inline component functions. Users can't find settings because unrelated features (units, suppliers, TARDOC, security) are all hidden behind the "Hospital" label. This reorganization breaks the admin area into 5 logically grouped pages while keeping the bottom nav pattern consistent with the rest of the app.

## New Admin Navigation (5 items)

| # | Nav Item | Icon | Route | Contents |
|---|----------|------|-------|----------|
| 1 | **Settings** | `fas fa-cog` | `/admin` | Company info, closures, regional prefs, stock runway, links, data, security, experimental |
| 2 | **Clinical** | `fas fa-stethoscope` | `/admin/clinical` | Units, rooms, checklists, templates |
| 3 | **Users** | `fas fa-users` | `/admin/users` | App users, staff members (unchanged) |
| 4 | **Integrations** | `fas fa-plug` | `/admin/integrations` | Galexis, SMS (ASPSMS), cameras, card reader, TARDOC |
| 5 | **Billing** | `fas fa-credit-card` | `/admin/billing` | License, addons, usage, invoices, legal docs (unchanged) |

---

## Page Breakdown

### 1. Settings (`/admin`)

Keeps the "general admin" functions. Tabs:

| Tab | Source | Complexity |
|-----|--------|------------|
| **Company** | Hospital.tsx → settings/company sub-tab | Medium — form fields, logo upload |
| **Closures** | Hospital.tsx → settings/closures sub-tab | Medium — CRUD with dialog |
| **Regional Preferences** | Hospital.tsx → settings/general sub-tab | Low — form fields |
| **Stock Runway** | Hospital.tsx → settings/runway sub-tab | Low — config fields |
| **Links** | Hospital.tsx → links tab | Medium — token generation, booking links |
| **Data** | Hospital.tsx → data tab | Low — seed/reset buttons |
| **Security** | Hospital.tsx → security tab (uses `LoginAuditLogTab` from `./LoginAuditLog`) | Low — already extracted component |
| **Experimental** | Hospital.tsx → experimental tab | Low — single toggle |

**Shared state within Settings.tsx:** `hospitalForm` and `updateHospitalMutation` are used by Company, Regional Preferences, Stock Runway, AND Experimental tabs. The Experimental tab writes `hospitalForm.addonPatientChat` and saves the entire form. These must all stay on the same page. The `fullHospitalData` query has conditional enabling (`enabled` only when `activeTab === "settings" || activeTab === "data"`) — in the new page, update this to always fetch when the page mounts (fixes a pre-existing bug where Experimental tab could use stale defaults if user navigates directly to it).

### 2. Clinical (`/admin/clinical`)

All operational/clinical setup. Tabs:

| Tab | Source | Complexity |
|-----|--------|------------|
| **Units** | Hospital.tsx → units tab | Medium — CRUD with dialog, unit types |
| **Rooms** | Hospital.tsx → rooms tab | Medium — CRUD with dialog |
| **Checklists** | Hospital.tsx → checklists tab | Medium — template CRUD |
| **Templates** | Hospital.tsx → templates tab (uses `DischargeBriefTemplateManager`) | Low — already extracted |

**Shared state within Clinical.tsx:** The `units` query is used by Units, Checklists (unit assignment dropdown), and Templates (passed as prop to `DischargeBriefTemplateManager`). The `surgeryRooms` query is used by Rooms and Checklists (room assignment checkboxes). These cross-tab dependencies are why all four tabs must stay on the same page.

**Note:** The `UNIT_TYPES` constant (defined at module scope in Hospital.tsx) should be extracted to a shared constants file — it's also used elsewhere per code review action item #2.

### 3. Users (`/admin/users`) — Unchanged

No changes. Already clean at 92.9 KB with 2 tabs (App Users, Staff Members).

### 4. Integrations (`/admin/integrations`)

All external systems and imports. Tabs:

| Tab | Source | Complexity |
|-----|--------|------------|
| **Galexis** | Hospital.tsx → suppliers tab (simplified) | Medium — catalog sync, status, simplified from full supplier CRUD |
| **SMS** | Hospital.tsx → integrations/aspsms (ASPSMS only, hide Vonage) | Medium — credentials, test send |
| **Cameras** | CameraDevices.tsx → cameras tab | Medium — device CRUD, vision AI provider |
| **Card Reader** | CameraDevices.tsx → card reader tab | Low — token generation |
| **TARDOC** | Hospital.tsx → tardoc tab | Medium — 5 import cards (already extracted components) |

**State to migrate:** Supplier state (~10 vars, simplify since Galexis-only). SMS state from `AspsmsIntegrationCard` + `SmsProviderSelector`. Camera/card reader state from CameraDevices.tsx. TARDOC state is minimal — the inline components (`TardocIntegrationCard`, `ChopIntegrationCard`, `ApIntegrationCard`, `CumulationRulesCard`, `TpwRatesCard`) manage their own state.

**Simplifications:**
- Remove Vonage SMS tab and `VonageIntegrationCard` (317 lines) — hide for now
- Remove Cal.com tab and `CalcomIntegrationCard` (716 lines) — legacy, already documented as unused
- Simplify supplier view to Galexis-specific (remove generic supplier CRUD UI)

**UX note:** The Settings > Company tab contains TARDOC billing identifiers (GLN, ZSR, TP value, IBAN). The Integrations > TARDOC tab handles catalog imports. This split is intentional (identity vs. data imports), but consider adding a brief hint in the TARDOC tab: "TARDOC billing identifiers (GLN, ZSR) are configured in Settings > Company."

### 5. Billing (`/admin/billing`) — Unchanged

No changes. Already self-contained at 1,213 lines.

---

## Extraction Strategy

The key challenge is that Hospital.tsx has ~40 state variables and 10 inline components all in one file. The extraction approach:

### Step 1: Extract inline components to their own files

Move these out of Hospital.tsx into `client/src/pages/admin/components/`:

| Component | Lines | Destination |
|-----------|-------|-------------|
| `CalcomIntegrationCard` | 716 | **Delete** (legacy) |
| `VonageIntegrationCard` | 317 | **Delete** (hide for now) |
| `AspsmsIntegrationCard` | 317 | `components/AspsmsIntegrationCard.tsx` |
| `SmsProviderSelector` | 57 | `components/SmsProviderSelector.tsx` |
| `TardocIntegrationCard` | 103 | `components/TardocIntegrationCard.tsx` |
| `ApIntegrationCard` | 90 | `components/ApIntegrationCard.tsx` |
| `CumulationRulesCard` | 128 | `components/CumulationRulesCard.tsx` |
| `TpwRatesCard` | 206 | `components/TpwRatesCard.tsx` |
| `ChopIntegrationCard` | 91 | `components/ChopIntegrationCard.tsx` |
| `BookingTokenSection` | 315 | `components/BookingTokenSection.tsx` |

### Step 2: Create new page files

| File | Source tabs |
|------|-----------|
| `client/src/pages/admin/Settings.tsx` | settings, links, data, security, experimental |
| `client/src/pages/admin/Clinical.tsx` | units, rooms, checklists, templates |
| `client/src/pages/admin/Integrations.tsx` | galexis, sms, cameras, card reader, tardoc |

Each page manages only its own state. State variables move from Hospital.tsx to the page that owns them.

### Step 3: Delete Hospital.tsx

Once all content is extracted, `Hospital.tsx` is no longer needed. The `/admin` route points to the new `Settings.tsx`.

### Step 4: Delete CameraDevices.tsx

Camera and card reader tabs merge into `Integrations.tsx`. The inline components (`VisionAiProviderCard`, `CardReaderTab`) move to `client/src/pages/admin/components/`.

### Step 5: Update routing and navigation

- Update `App.tsx` routes (add `/admin/clinical`, `/admin/integrations`, remove `/admin/cameras`)
- Update `App.tsx` lazy imports (replace `AdminHospital` with `AdminSettings`, add `AdminClinical`, `AdminIntegrations`, remove `AdminCameraDevices`)
- Add redirect route: `/admin/cameras` → `/admin/integrations` (preserves bookmarks/links)
- Update `BottomNav.tsx` admin items (5 items, new routes, new icons)
- Update `BottomNav.tsx` `isActive` logic — add cases for `/admin/clinical` and `/admin/integrations` (current logic uses exact match for `/admin`, which won't highlight new routes)
- Update `BillingLock.tsx` `allowedPaths` — replace `/admin/cameras` with `/admin/clinical` and `/admin/integrations`

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/pages/admin/Settings.tsx` | New Settings page (company, closures, prefs, links, data, security, experimental) |
| `client/src/pages/admin/Clinical.tsx` | New Clinical page (units, rooms, checklists, templates) |
| `client/src/pages/admin/Integrations.tsx` | New Integrations page (galexis, SMS, cameras, card reader, TARDOC) |
| `client/src/pages/admin/components/AspsmsIntegrationCard.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/SmsProviderSelector.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/TardocIntegrationCard.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/ApIntegrationCard.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/CumulationRulesCard.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/TpwRatesCard.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/ChopIntegrationCard.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/BookingTokenSection.tsx` | Extracted from Hospital.tsx |
| `client/src/pages/admin/components/VisionAiProviderCard.tsx` | Extracted from CameraDevices.tsx |
| `client/src/pages/admin/components/CardReaderTab.tsx` | Extracted from CameraDevices.tsx |

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/BottomNav.tsx` | Update admin nav items (5 items, new routes) + fix `isActive` logic |
| `client/src/components/BillingLock.tsx` | Update `allowedPaths`: replace `/admin/cameras` with `/admin/clinical`, `/admin/integrations` |
| `client/src/App.tsx` | Update admin routes + lazy imports + add `/admin/cameras` redirect |
| i18n translation files | Add keys: `bottomNav.admin.settings`, `bottomNav.admin.clinical`, `bottomNav.admin.integrations` |

## Files to Delete

| File | Reason |
|------|--------|
| `client/src/pages/admin/Hospital.tsx` | Replaced by Settings.tsx, Clinical.tsx, Integrations.tsx |
| `client/src/pages/admin/CameraDevices.tsx` | Merged into Integrations.tsx |

---

## Risk Mitigation

- **No feature loss:** Every tab from Hospital.tsx lands in a new home. Cal.com and Vonage are hidden but code is preserved in git history.
- **Incremental extraction:** Extract components first (step 1), then create pages (step 2), then delete originals (step 3-4). Each step can be verified independently.
- **State scoping:** Cross-tab dependencies documented and respected — `hospitalForm`/`updateHospitalMutation` stay together in Settings.tsx, `units`/`surgeryRooms` queries stay together in Clinical.tsx.
- **Backward compat:** `/admin/cameras` redirect preserves existing bookmarks and documentation links.

---

## Verification Plan

1. **Navigation:** All 5 bottom nav items render, navigate correctly, and highlight the active item
2. **Settings page:** All 8 tabs render — company form saves, closures CRUD works, regional prefs save, stock runway saves, links/tokens generate, data seed/reset work, security audit log loads, experimental toggle works
3. **Clinical page:** All 4 tabs render — units CRUD, rooms CRUD, checklists CRUD, discharge templates load
4. **Integrations page:** All 5 tabs render — Galexis catalog sync works, ASPSMS credentials save + test send, cameras CRUD + vision AI toggle, card reader token generates, TARDOC/CHOP/AP imports work + TPW rates manage
5. **Users page:** Unchanged — verify still works
6. **Billing page:** Unchanged — verify still works
7. **BillingLock:** Verify locked users can access all 5 admin routes (especially new `/admin/clinical` and `/admin/integrations`)
8. **Redirect:** `/admin/cameras` redirects to `/admin/integrations`
9. **No broken imports:** `npm run check` passes clean
10. **i18n:** All new nav labels display correctly in EN and DE
