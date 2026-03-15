# Command Palette — App-Wide Search & Quick Actions

**Date:** 2026-03-15

## Context

The admin area has 40+ settings sections spread across 4 pages and 12+ tabs, making it hard for users to find what they need. Beyond admin, the app has grown to include patients, surgeries, inventory, and users — all navigable but with no unified search. This feature adds a global command palette (Cmd+K) with a visible TopBar button, combining static navigation, quick actions, and live entity search in one place.

## Overview

A single `CommandPalette` component using the existing `cmdk` library and shadcn `CommandDialog`. Triggered by a search button in the TopBar or `Cmd/Ctrl+K`. Combines three result types:

1. **Static destinations** — all pages, admin tabs, module sections
2. **Quick actions** — "Create New Patient," "Schedule Surgery," etc.
3. **Live entity search** — patients, surgeries, inventory items, users (debounced API, 2+ chars)

---

## Component Structure

### CommandPaletteContext

A React context providing:

- `open()` / `close()` — control palette visibility from anywhere
- `registerAction(key, handler)` / `unregisterAction(key)` — pages register callback actions on mount

Mounted in `Layout.tsx` wrapping all children, **outside `BillingLock`** so the palette is always accessible. Items pointing to locked features should be filtered out when billing is locked.

### CommandPalette Component

**File:** `client/src/components/CommandPalette.tsx`

- Uses `CommandDialog` from `@/components/ui/command`
- Mounts once in `Layout.tsx` (alongside TopBar/BottomNav)
- Listens for `Cmd+K` / `Ctrl+K` globally
- Manages search input state, debounced API queries, and result rendering
- On mobile: renders full-width for easy touch interaction

### TopBar Integration

**File:** `client/src/components/TopBar.tsx`

- Add a search button to the right side of the TopBar, before the chat button
- Icon: `Search` from Lucide (magnifying glass)
- Button style: matches existing pattern (`w-9 h-9 rounded-lg hover:bg-accent`)
- Tooltip: "Search (⌘K)" / "Search (Ctrl+K)" based on platform detection
- On wider screens: optionally render as a pill with "Search..." text + shortcut badge
- Clicking calls `commandPalette.open()` from context

---

## Static Registry

**File:** `client/src/lib/command-palette-items.ts`

A flat array of item definitions. All labels and sections use i18n translation keys, resolved at render time via `t()`. Keywords include both EN and DE terms for bilingual search.

```ts
import { type LucideIcon, Search, Users, Settings, ... } from "lucide-react";

interface CommandPaletteItem {
  id: string;
  labelKey: string;          // i18n translation key
  sectionKey: string;        // i18n translation key for group heading
  icon: LucideIcon;          // Lucide component reference (type-safe, tree-shakeable)
  keywords: string[];        // Extra terms for fuzzy matching (EN + DE)
  action:
    | { type: "navigate"; path: string; tab?: string }
    | { type: "callback"; key: string; targetPath?: string };
  requiredRole?: "admin" | "doctor" | "nurse" | "manager" | "staff";
  requiredAddon?: string;    // Hospital addon flag name
}
```

**Icon strategy:** Use Lucide component references exclusively for palette items. They're type-safe, tree-shakeable, and avoid runtime string-to-component mapping. The existing FA icons in tab definitions are only used within those pages — the palette has its own icon set.

### Navigation Items (examples)

All items navigate to actual tab values that exist in the codebase. The Hospital page's tab union is: `"settings" | "data" | "links" | "units" | "rooms" | "checklists" | "templates" | "suppliers" | "integrations" | "tardoc" | "security" | "experimental"`.

Items like "Closures" and "Regional Preferences" both navigate to `tab=settings` (the tab that contains them). No subtab concept — we navigate to the correct tab, which is specific enough.

| Section | Label | Path | Tab |
|---------|-------|------|-----|
| Pages | Patients | /patients | — |
| Pages | Surgeries | /surgeries | — |
| Pages | Inventory | /inventory | — |
| Admin — Settings | Settings | /admin | settings |
| Admin — Settings | Closures | /admin | settings |
| Admin — Settings | Regional Preferences | /admin | settings |
| Admin — Settings | Stock Runway Alerts | /admin | settings |
| Admin — Clinical | Units | /admin | units |
| Admin — Clinical | Rooms | /admin | rooms |
| Admin — Clinical | Checklists | /admin | checklists |
| Admin — Clinical | Templates | /admin | templates |
| Admin — Integrations | Suppliers | /admin | suppliers |
| Admin — Integrations | SMS Providers | /admin | integrations |
| Admin — Billing | TARDOC | /admin | tardoc |
| Admin — Security | Login Audit Log | /admin | security |
| Admin — Security | Experimental Features | /admin | experimental |
| Admin | Users | /admin/users | — |
| Admin | Staff Members | /admin/users | staff |
| Admin | Cameras | /admin/cameras | — |
| Admin | Card Reader | /admin/cameras | cardreader |
| Admin | Billing & License | /admin/billing | — |

### Action Items (examples)

| Label | Callback Key | Target Path |
|-------|-------------|-------------|
| Create New Patient | createPatient | /patients |
| Schedule Surgery | scheduleSurgery | /surgeries |
| Add Inventory Item | addInventoryItem | /inventory |
| Add New User | addUser | /admin/users |

### Filtering

Items filtered at render time based on:
- `requiredRole` vs `activeHospital.role` (role for the currently selected hospital/unit, not a global user role)
- `requiredAddon` vs current hospital's addon flags
- Admin items hidden for non-admin users
- Locked features hidden when billing is locked

`cmdk` handles fuzzy matching on resolved `label` + `keywords` automatically.

---

## Tab Navigation Mechanism

For items with `tab`, navigate using URL search params: `/admin?tab=units`. The Hospital page reads `tab` from the URL search param on mount and sets `activeTab` accordingly. This requires a small change to `Hospital.tsx` to read initial tab from URL params — a clean, linkable approach.

Same pattern applies to Users (`?tab=staff`) and CameraDevices (`?tab=cardreader`).

---

## Live Entity Search

### API Endpoint

**Route:** `GET /api/search/:hospitalId?q=<term>&limit=5`
**File:** `server/routes/search.ts`
**Middleware:** `isAuthenticated, requireStrictHospitalAccess`

Single endpoint that fans out to 4 queries in parallel:

```ts
{
  patients: [{ id, name, dob, patientNumber }],
  surgeries: [{ id, patientName, date, procedure }],
  inventoryItems: [{ id, name, sku }],
  users: [{ id, name, email, role }]
}
```

**Query strategy:**
- `ILIKE '%term%'` on relevant text columns
- `LIMIT 5` per entity type
- All 4 queries run with `Promise.all` for speed
- Surgery search joins with patients table on `patientId` to get patient name
- Only queries entities the user has access to (role-based)
- Future optimization if needed: `pg_trgm` GIN indexes for faster wildcard matching

### Client-Side Integration

- Debounce: 300ms after last keystroke
- Minimum: 2 characters before triggering API call
- AbortController: cancel in-flight request when user types more
- Use `useQuery` from tanstack with query key `['/api/search', hospitalId, debouncedQuery]` and `enabled: query.length >= 2 && !!hospitalId`
- Entity results appear in separate `CommandGroup` sections below static results
- Loading spinner shown while fetching

### Empty States

- **Before typing:** Show "Recent" section (last 5 visited pages, stored in localStorage) + all static items
- **1 character typed:** Show filtered static items only, placeholder: "Type 2+ characters to search patients, surgeries..."
- **2+ characters, loading:** Static results shown immediately, entity sections show spinner
- **2+ characters, no results:** "No results found for '...'"

### Result Display

Each entity type gets a `CommandGroup` with results formatted as:

- **Patients:** `John Doe` — `#12345 · DOB 15.03.1990`
- **Surgeries:** `Knee Replacement` — `John Doe · 20.03.2026`
- **Inventory:** `Paracetamol 500mg` — `SKU: INV-001`
- **Users:** `Dr. Smith` — `doctor · smith@clinic.ch`

Selecting a result navigates to its detail page.

---

## Action Callbacks

### Registration Pattern

Pages register action handlers via context on mount:

```tsx
// In PatientsPage
const { registerAction, unregisterAction } = useCommandPalette();

useEffect(() => {
  registerAction("createPatient", () => setShowCreateDialog(true));
  return () => unregisterAction("createPatient");
}, []);
```

### Cross-Page Actions

If the user selects an action for a page they're not on:

1. Palette navigates to `targetPath`
2. Stores `pendingAction` in context
3. Target page checks for `pendingAction` on mount (after registering handlers), executes it, clears it
4. Use a small `requestAnimationFrame` delay after handler registration to ensure the page is ready before firing the pending action

---

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `client/src/components/CommandPalette.tsx` | Main palette component + context provider + hook |
| `client/src/lib/command-palette-items.ts` | Static registry of all destinations + actions |
| `client/src/hooks/useDebounce.ts` | Generic debounce hook (existing `useDebouncedAutoSave` is too specialized) |
| `server/routes/search.ts` | Search API endpoint |

### Modified Files

| File | Change |
|------|--------|
| `client/src/components/Layout.tsx` | Wrap children with `CommandPaletteProvider` (outside BillingLock) |
| `client/src/components/TopBar.tsx` | Add search button |
| `client/src/pages/admin/Hospital.tsx` | Read `tab` from URL search params for deep linking |
| `client/src/pages/admin/Users.tsx` | Read `tab` from URL search params |
| `client/src/pages/admin/CameraDevices.tsx` | Read `tab` from URL search params |
| `server/routes/index.ts` | Register search router |
| i18n translation files | Add `commandPalette.*` keys |

### Pages that Register Actions

| File | Action |
|------|--------|
| Patient list page | `createPatient` |
| Surgery list page | `scheduleSurgery` |
| Inventory page | `addInventoryItem` |
| Admin users page | `addUser` |

---

## Verification Plan

1. **Static navigation:** Open palette, type "units" → see "Units" in results → select → lands on `/admin` with Units tab active
2. **Deep admin linking:** Type "closures" → navigates to `/admin?tab=settings`
3. **Actions:** Type "create patient" → select → create patient dialog opens
4. **Cross-page action:** From admin page, select "Create New Patient" → navigates to patients page, dialog opens
5. **Live search:** Type a known patient name → results appear after 300ms → select → navigates to patient detail
6. **Keyboard shortcut:** Press Cmd+K → palette opens. Press Escape → closes.
7. **TopBar button:** Click search icon → palette opens
8. **Role filtering:** Non-admin user should not see admin items
9. **Performance:** Typing fast should not cause multiple overlapping API calls (AbortController)
10. **i18n:** Switch language to DE → all palette labels and sections show in German
11. **Mobile:** Tap search icon → palette opens full-width, touch scrolling works
12. **TypeScript:** `npm run check` passes clean
