# Command Palette — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an app-wide command palette (Cmd+K) with static navigation, quick actions, and live entity search.

**Architecture:** A `CommandPalette` component using the existing `cmdk` library + shadcn `CommandDialog`, mounted in `Layout.tsx`. A `CommandPaletteContext` provides open/close + action registration. A search button in `TopBar.tsx` triggers the palette. A new `GET /api/search/:hospitalId` endpoint handles live entity search. Static items defined in a registry file with i18n keys.

**Tech Stack:** React, TypeScript, cmdk, shadcn/ui Command components, tanstack/react-query, wouter, react-i18next, Express, Drizzle ORM (PostgreSQL)

**Spec:** `docs/superpowers/specs/2026-03-15-command-palette-design.md`

**Note:** The spec references `Hospital.tsx` and `CameraDevices.tsx` — these have been replaced by `Settings.tsx`, `Clinical.tsx`, and `Integrations.tsx` during the admin reorganization. This plan uses the current file structure.

---

## Chunk 1: Backend Search Endpoint

### Task 1: Create search API route

**Files:**
- Create: `server/routes/search.ts`
- Modify: `server/routes/index.ts`

- [ ] **Step 1: Create `server/routes/search.ts`**

```typescript
import { Router } from "express";
import type { Response } from "express";
import { isAuthenticated } from "../auth/google";
import { requireStrictHospitalAccess } from "../utils/accessControl";
import { db } from "../db";
import { patients, surgeries, items, users, userHospitalRoles } from "@shared/schema";
import { sql, ilike, or, and, eq } from "drizzle-orm";

const router = Router();

router.get('/api/search/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = req.params.hospitalId;
    const query = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);

    if (!query || query.length < 2) {
      return res.json({ patients: [], surgeries: [], inventoryItems: [], users: [] });
    }

    const searchPattern = `%${query}%`;

    const [patientResults, surgeryResults, itemResults, userResults] = await Promise.all([
      // Patients
      db.select({
        id: patients.id,
        firstName: patients.firstName,
        surname: patients.surname,
        birthday: patients.birthday,
        patientNumber: patients.patientNumber,
      })
      .from(patients)
      .where(and(
        eq(patients.hospitalId, hospitalId),
        or(
          ilike(patients.firstName, searchPattern),
          ilike(patients.surname, searchPattern),
          ilike(patients.patientNumber, searchPattern),
        )
      ))
      .limit(limit),

      // Surgeries (join with patients for name)
      db.select({
        id: surgeries.id,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
      })
      .from(surgeries)
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        or(
          ilike(surgeries.plannedSurgery, searchPattern),
          ilike(patients.firstName, searchPattern),
          ilike(patients.surname, searchPattern),
        )
      ))
      .limit(limit),

      // Inventory items
      db.select({
        id: items.id,
        name: items.name,
      })
      .from(items)
      .where(and(
        eq(items.hospitalId, hospitalId),
        ilike(items.name, searchPattern),
      ))
      .limit(limit),

      // Users (who have access to this hospital)
      db.selectDistinctOn([users.id], {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: userHospitalRoles.role,
      })
      .from(users)
      .innerJoin(userHospitalRoles, eq(users.id, userHospitalRoles.userId))
      .where(and(
        eq(userHospitalRoles.hospitalId, hospitalId),
        or(
          ilike(users.firstName, searchPattern),
          ilike(users.lastName, searchPattern),
          ilike(users.email, searchPattern),
        )
      ))
      .limit(limit),
    ]);

    res.json({
      patients: patientResults.map(p => ({
        id: p.id,
        name: `${p.firstName || ''} ${p.surname || ''}`.trim(),
        dob: p.birthday,
        patientNumber: p.patientNumber,
      })),
      surgeries: surgeryResults.map(s => ({
        id: s.id,
        patientName: `${s.patientFirstName || ''} ${s.patientSurname || ''}`.trim(),
        date: s.plannedDate,
        procedure: s.plannedSurgery,
      })),
      inventoryItems: itemResults.map(i => ({
        id: i.id,
        name: i.name,
      })),
      users: userResults.map(u => ({
        id: u.id,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        email: u.email,
        role: u.role,
      })),
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

export default router;
```

- [ ] **Step 2: Register the route in `server/routes/index.ts`**

Add import and registration:
```typescript
import searchRouter from "./search";
// In registerDomainRoutes():
app.use(searchRouter);
```

- [ ] **Step 3: Verify and commit**

```bash
npm run check
git add server/routes/search.ts server/routes/index.ts
git commit -m "feat: add global search API endpoint"
```

---

## Chunk 2: Client — Debounce Hook + Static Registry + i18n

### Task 2: Create useDebounce hook

**Files:**
- Create: `client/src/hooks/useDebounce.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useDebounce.ts
git commit -m "feat: add generic useDebounce hook"
```

### Task 3: Create static items registry

**Files:**
- Create: `client/src/lib/command-palette-items.ts`

- [ ] **Step 1: Create the registry file**

Define the `CommandPaletteItem` interface and all static navigation + action items. Use Lucide icon component references. Include bilingual keywords (EN + DE).

Key items to include:
- **Pages:** Patients, Surgeries, Inventory, Appointments, Clinic
- **Admin — Settings:** Settings, Closures, Regional Preferences, Stock Runway, Links, Data, Security, Experimental
- **Admin — Clinical:** Units, Rooms, Checklists, Templates
- **Admin — Integrations:** Galexis, SMS, Cameras, Card Reader, TARDOC
- **Admin — Other:** Users, Staff, Billing & License
- **Actions:** Create New Patient, Schedule Surgery, Add Inventory Item, Add New User

Navigation paths use the current admin structure:
- `/admin` for Settings page tabs
- `/admin/clinical` for Clinical page tabs
- `/admin/integrations` for Integrations page tabs
- `/admin/users` for Users
- `/admin/billing` for Billing

Items with `tab` values use URL search params: `?tab=value`.

Admin items should have `requiredRole: "admin"`.

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/command-palette-items.ts
git commit -m "feat: add command palette static items registry"
```

### Task 4: Add i18n translation keys

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add commandPalette section to EN translations**

Add under a `commandPalette` key:
- `placeholder`: "Search pages, actions, patients..."
- `noResults`: "No results found"
- `typeToSearch`: "Type 2+ characters to search patients, surgeries..."
- Section headings: `pages`, `admin`, `adminSettings`, `adminClinical`, `adminIntegrations`, `actions`, `patients`, `surgeries`, `inventory`, `users`
- Labels for all items and actions

- [ ] **Step 2: Add same keys to DE translations**

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add i18n keys for command palette"
```

---

## Chunk 3: Client — CommandPalette Component + Context

### Task 5: Create CommandPalette component with context

**Files:**
- Create: `client/src/components/CommandPalette.tsx`

This is the main file. It contains:
1. `CommandPaletteContext` + `CommandPaletteProvider` — context for open/close, action registration, pending actions
2. `useCommandPalette()` hook — consume the context
3. `CommandPalette` component — the actual palette UI

- [ ] **Step 1: Create the context and provider**

```typescript
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  registerAction: (key: string, handler: () => void) => void;
  unregisterAction: (key: string) => void;
  pendingAction: string | null;
  clearPendingAction: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}
```

The provider manages:
- `isOpen` state
- `actions` ref (Map of key → handler)
- `pendingAction` state (for cross-page actions)

- [ ] **Step 2: Create the palette UI component**

Uses:
- `CommandDialog` from `@/components/ui/command`
- `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`
- `useDebounce` from `@/hooks/useDebounce`
- `useQuery` from tanstack for live search
- `useActiveHospital` for hospital context and role filtering
- `useTranslation` for i18n
- `useLocation` from wouter for navigation
- Static items from `@/lib/command-palette-items`

**Keyboard shortcut:** Register `Cmd+K` / `Ctrl+K` via `useEffect` with `keydown` listener.

**Search flow:**
1. User types → `query` state updates
2. Static items filtered by `cmdk`'s built-in fuzzy matching on label + keywords
3. When `query.length >= 2`, debounced value triggers `useQuery` to `/api/search/:hospitalId`
4. Entity results rendered in separate `CommandGroup` sections below static results
5. Loading spinner while fetching

**Item selection handler:**
- Navigation items: `navigate(path + (tab ? "?tab=" + tab : ""))`; close palette
- Callback items: if handler registered, call it; if not, set `pendingAction` + navigate to `targetPath`; close palette
- Entity items: navigate to detail page; close palette

**Role filtering:** Filter static items at render time:
- Skip items with `requiredRole` that doesn't match `activeHospital.role`
- Skip admin items for non-admin users

- [ ] **Step 3: Wire provider + component together**

The provider wraps children and renders `<CommandPalette />` inside itself.

```tsx
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  // ... state and handlers
  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run check
git add client/src/components/CommandPalette.tsx
git commit -m "feat: add CommandPalette component with context and live search"
```

---

## Chunk 4: Integration — Layout, TopBar, Tab Deep-linking

### Task 6: Add CommandPaletteProvider to Layout.tsx

**Files:**
- Modify: `client/src/components/Layout.tsx`

- [ ] **Step 1: Import and wrap**

Import `CommandPaletteProvider` from `@/components/CommandPalette`.

Wrap around children, outside BillingLock:

```tsx
<CommandPaletteProvider>
  <BillingLock>
    {children}
  </BillingLock>
</CommandPaletteProvider>
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Layout.tsx
git commit -m "feat: mount CommandPaletteProvider in Layout"
```

### Task 7: Add search button to TopBar

**Files:**
- Modify: `client/src/components/TopBar.tsx`

- [ ] **Step 1: Add search button before chat button**

Import `useCommandPalette` and `Search` icon from lucide-react.

Add before the chat button (before `<div className="flex items-center gap-3 shrink-0">`'s first child):

```tsx
<button
  onClick={() => commandPalette.open()}
  className="w-9 h-9 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
  title={navigator.platform.includes('Mac') ? 'Search (⌘K)' : 'Search (Ctrl+K)'}
  data-testid="button-search"
>
  <Search className="w-5 h-5 text-foreground" />
</button>
```

- [ ] **Step 2: Verify and commit**

```bash
npm run check
git add client/src/components/TopBar.tsx
git commit -m "feat: add search button to TopBar"
```

### Task 8: Add tab deep-linking to admin pages

**Files:**
- Modify: `client/src/pages/admin/Settings.tsx`
- Modify: `client/src/pages/admin/Clinical.tsx`
- Modify: `client/src/pages/admin/Integrations.tsx`
- Modify: `client/src/pages/admin/Users.tsx`

For each page, read `?tab=` from URL search params on mount and set `activeTab` if the value is valid.

- [ ] **Step 1: Add to Settings.tsx**

```typescript
// At the top of the component:
const searchParams = new URLSearchParams(window.location.search);
const urlTab = searchParams.get('tab');

const [activeTab, setActiveTab] = useState<...>(
  (urlTab && ["settings", "links", "data", "security", "experimental"].includes(urlTab))
    ? urlTab as any
    : "settings"
);
```

- [ ] **Step 2: Add to Clinical.tsx**

Same pattern with valid tabs: `"units" | "rooms" | "checklists" | "templates"`.

- [ ] **Step 3: Add to Integrations.tsx**

Same pattern with valid tabs: `"galexis" | "sms" | "cameras" | "cardreader" | "tardoc"`.

- [ ] **Step 4: Add to Users.tsx**

Read `?tab=` and set initial tab if valid (check what tab values Users.tsx uses).

- [ ] **Step 5: Verify and commit**

```bash
npm run check
git add client/src/pages/admin/Settings.tsx client/src/pages/admin/Clinical.tsx client/src/pages/admin/Integrations.tsx client/src/pages/admin/Users.tsx
git commit -m "feat: add tab deep-linking via URL search params to admin pages"
```

---

## Chunk 5: Verification

### Task 9: Full verification

- [ ] **Step 1: TypeScript check**

```bash
npm run check
```

- [ ] **Step 2: Manual smoke test**

Start `npm run dev` and verify:

1. **TopBar button:** Search icon visible, clicking opens palette
2. **Keyboard shortcut:** Cmd/Ctrl+K opens palette, Escape closes
3. **Static navigation:** Type "units" → "Units" appears → select → lands on `/admin/clinical?tab=units`
4. **Admin filtering:** Non-admin user should not see admin items
5. **Live search:** Type a patient name (2+ chars) → results appear → select → navigates to patient detail
6. **Entity search:** Results show for patients, surgeries, inventory, users
7. **i18n:** Switch to DE → labels show in German
8. **Mobile:** Palette opens full-width on narrow screens

- [ ] **Step 3: Fix any issues and commit**

```bash
npm run check
git add -A
git commit -m "fix: command palette post-implementation fixes"
```
