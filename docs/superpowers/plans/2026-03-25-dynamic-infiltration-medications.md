# Dynamic Infiltration & Medications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to dynamically add medications from inventory to the Infiltration & Medications card, with automatic inventory tracking via the existing anesthesia inventory system.

**Architecture:** Extend the `intraOpData.medications` JSONB with a `customMedications` array. When a user selects an inventory item, it appears as a row in the card AND creates a pending `inventory_usage` entry (qty=1) via the existing manual inventory endpoint. Removal zeros out the inventory usage. Commit/rollback uses the existing mechanism unchanged.

**Tech Stack:** React, TanStack Query, shadcn/ui (Command + Popover), Zod, Drizzle JSONB

**Spec:** `docs/superpowers/specs/2026-03-25-dynamic-infiltration-medications-design.md`

---

### Task 1: Extend Schema Types

**Files:**
- Modify: `shared/schema.ts:1280-1286` (JSONB `$type`)
- Modify: `shared/schema.ts:2905-2916` (Zod validation schema)

- [ ] **Step 1: Extend the JSONB `$type` for medications**

In `shared/schema.ts` at line 1280, add `customMedications` to the medications type:

```ts
// Enhanced: Medications section with checkboxes
medications?: {
  ropivacain?: boolean;
  bupivacain?: boolean;
  contrast?: boolean;         // Kontrastmittel
  ointments?: boolean;        // Salben
  other?: string;             // Free text for custom entries
  // Dynamic medications from inventory
  customMedications?: Array<{
    itemId: string;       // inventory item ID
    name: string;         // snapshot of item name at selection time
    volume?: string;      // optional volume in ml
  }>;
};
```

- [ ] **Step 2: Update the Zod validation schema**

In `shared/schema.ts` at line 2905, add `customMedications` and `.passthrough()`:

```ts
medications: z.object({
  rapidocain1: z.boolean().optional(),
  ropivacainEpinephrine: z.boolean().optional(),
  ropivacain05: z.boolean().optional(),
  ropivacain075: z.boolean().optional(),
  ropivacain1: z.boolean().optional(),
  bupivacain: z.boolean().optional(),
  vancomycinImplant: z.boolean().optional(),
  contrast: z.boolean().optional(),
  ointments: z.boolean().optional(),
  other: z.string().optional().nullable(),
  customMedications: z.array(z.object({
    itemId: z.string(),
    name: z.string(),
    volume: z.string().optional().nullable(),
  })).optional(),
}).passthrough().optional(),
```

Note: `.passthrough()` is needed so dynamic volume keys like `rapidocain1Volume`, `bupivacain025Volume` etc. (sent by the UI but not declared in the Zod schema) are preserved instead of stripped.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: PASS — no type errors

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat: extend intraOpData schema for custom infiltration medications"
```

---

### Task 2: Add Translations

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add English translations**

Find the `surgery.intraop` section in `en.json` and add:

```json
"addCustomMedication": "Add medication...",
"searchInventoryMedication": "Search inventory...",
"noMedicationFound": "No medication found",
"customMedicationAdded": "Medication added",
"customMedicationRemoved": "Medication removed",
"customMedications": "Additional Medications"
```

- [ ] **Step 2: Add German translations**

Find the `surgery.intraop` section in `de.json` and add:

```json
"addCustomMedication": "Medikament hinzufügen...",
"searchInventoryMedication": "Inventar durchsuchen...",
"noMedicationFound": "Kein Medikament gefunden",
"customMedicationAdded": "Medikament hinzugefügt",
"customMedicationRemoved": "Medikament entfernt",
"customMedications": "Zusätzliche Medikamente"
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: add translations for custom infiltration medications"
```

---

### Task 3: Build the Custom Medications UI in IntraOpTab

**Files:**
- Modify: `client/src/pages/anesthesia/op/IntraOpTab.tsx:1350-1592`

**Reference pattern:** `client/src/components/anesthesia/DischargeMedicationsTab.tsx:1091-1161` (Popover+Command item search)

This is the main task. It adds:
1. State for the custom medications combobox
2. A query to fetch inventory items
3. A mutation to add/remove inventory usage
4. UI rendering of custom medication rows + search combobox

- [ ] **Step 1: Add missing imports**

Most imports are already present in `IntraOpTab.tsx` (Command, Popover, Plus, X, useQuery, apiRequest, queryClient). The only missing import is `useMemo`. Update line 1:

```tsx
import { useState, useEffect, useMemo } from "react";
```

- [ ] **Step 2: Add state and queries inside the component**

Inside the `IntraOpTab` component function (after the existing state declarations around line 148), add:

```tsx
// Custom medications state
const [medSearchOpen, setMedSearchOpen] = useState(false);
const [medSearchQuery, setMedSearchQuery] = useState("");
const queryClient = useQueryClient();

const hospitalId = activeHospital?.id;
const unitId = activeHospital?.unitId;

// Fetch inventory items for search
const { data: inventoryItems = [] } = useQuery<any[]>({
  queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId],
  enabled: !!hospitalId && !!unitId,
});

// Fetch current inventory usage to find IDs for removal
const { data: inventoryUsageItems = [] } = useQuery<any[]>({
  queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`],
  enabled: !!anesthesiaRecordId,
});

// Filter items for the search combobox
const filteredMedItems = useMemo(() => {
  const existing = intraOpData.medications?.customMedications?.map((m: any) => m.itemId) ?? [];
  const available = inventoryItems.filter((item: any) => !existing.includes(item.id));
  if (!medSearchQuery.trim()) return available.slice(0, 50);
  const query = medSearchQuery.toLowerCase();
  return available
    .filter((item: any) =>
      item.name?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query)
    )
    .slice(0, 50);
}, [inventoryItems, medSearchQuery, intraOpData.medications?.customMedications]);
```

- [ ] **Step 3: Add handler functions**

After the state/queries, add the handler functions:

```tsx
// Add a custom medication from inventory.
// Note: inventory_usage has a unique constraint on (anesthesiaRecordId, itemId).
// If the same item is already tracked via anesthesia drug doses, the manual endpoint
// will upsert and overwrite the calculated qty with overrideQty: 1.
// This is acceptable — the user can adjust in the Inventory Tab.
const addCustomMedication = async (item: any) => {
  const newEntry = { itemId: item.id, name: item.name, volume: '' };
  const currentCustom = intraOpData.medications?.customMedications ?? [];
  const updated = {
    ...intraOpData,
    medications: {
      ...intraOpData.medications,
      customMedications: [...currentCustom, newEntry],
    },
  };
  setIntraOpData(updated);
  intraOpAutoSave.mutate(updated);
  setMedSearchOpen(false);
  setMedSearchQuery("");

  // Add to inventory usage (qty=1)
  if (anesthesiaRecordId) {
    try {
      await apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/manual`, {
        itemId: item.id,
        qty: 1,
        reason: 'Infiltration medication',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
    } catch (err) {
      console.error('Failed to add inventory usage:', err);
      // Inventory tracking failed but the medication is still documented in JSONB
    }
  }
};

// Remove a custom medication
const removeCustomMedication = async (itemId: string) => {
  const currentCustom = intraOpData.medications?.customMedications ?? [];
  const updated = {
    ...intraOpData,
    medications: {
      ...intraOpData.medications,
      customMedications: currentCustom.filter((m: any) => m.itemId !== itemId),
    },
  };
  setIntraOpData(updated);
  intraOpAutoSave.mutate(updated);

  // Zero out inventory usage
  if (anesthesiaRecordId) {
    try {
      const usageRow = inventoryUsageItems.find((u: any) => u.itemId === itemId);
      if (usageRow) {
        await apiRequest('PATCH', `/api/anesthesia/inventory/${usageRow.id}/override`, {
          overrideQty: 0,
          overrideReason: 'Removed from infiltration medications',
        });
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
      }
    } catch (err) {
      console.error('Failed to zero inventory usage:', err);
    }
  }
};

// Update volume for a custom medication
const updateCustomMedicationVolume = (itemId: string, volume: string) => {
  const currentCustom = intraOpData.medications?.customMedications ?? [];
  const updated = {
    ...intraOpData,
    medications: {
      ...intraOpData.medications,
      customMedications: currentCustom.map((m: any) =>
        m.itemId === itemId ? { ...m, volume } : m
      ),
    },
  };
  setIntraOpData(updated);
};
```

- [ ] **Step 4: Add the UI for custom medications**

In the JSX, after the epinephrine checkbox + total volume + other infiltration input (around line 1542, just before the `<hr>` divider), add the custom medications section:

```tsx
{/* Custom Medications from Inventory */}
{(intraOpData.medications?.customMedications?.length ?? 0) > 0 && (
  <div className="space-y-2">
    <span className="text-xs font-medium text-muted-foreground">{t('surgery.intraop.customMedications')}</span>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {intraOpData.medications?.customMedications?.map((med: any) => (
        <div key={med.itemId} className="flex items-center gap-2">
          <span className="text-sm flex-1 truncate">{med.name}</span>
          <div className="flex items-center gap-1">
            <Input
              className="h-7 w-20 text-sm"
              placeholder="0"
              value={med.volume ?? ''}
              onChange={(e) => updateCustomMedicationVolume(med.itemId, e.target.value)}
              onBlur={() => intraOpAutoSave.mutate(intraOpData)}
            />
            <span className="text-xs text-muted-foreground">{t('surgery.intraop.mlUnit')}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeCustomMedication(med.itemId)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  </div>
)}

{/* Add Medication from Inventory */}
<Popover open={medSearchOpen} onOpenChange={setMedSearchOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!anesthesiaRecordId}>
      <Plus className="h-3.5 w-3.5 mr-1" />
      {t('surgery.intraop.addCustomMedication')}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[350px] p-0" align="start">
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={t('surgery.intraop.searchInventoryMedication')}
        value={medSearchQuery}
        onValueChange={setMedSearchQuery}
      />
      <CommandList>
        <CommandEmpty>{t('surgery.intraop.noMedicationFound')}</CommandEmpty>
        <CommandGroup>
          {filteredMedItems.map((item: any) => (
            <CommandItem
              key={item.id}
              value={item.name}
              onSelect={() => addCustomMedication(item)}
            >
              <div className="flex items-center gap-2 w-full">
                <span className="truncate flex-1">{item.name}</span>
                {item.description && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">{item.description}</span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

- [ ] **Step 5: Update the IntraOpData interface**

At line 84 of `IntraOpTab.tsx`, the existing `medications` type has an index signature:

```ts
[key: string]: boolean | string | undefined;
```

Change it to allow the `customMedications` array:

```ts
[key: string]: boolean | string | undefined | Array<any>;
```

This is required because `customMedications` is an `Array` which doesn't match `boolean | string | undefined`.

- [ ] **Step 6: Update `hasIntraOpData` check**

At line 190-192, the `infiltrationMedications` case uses `Object.values(intraOpData.medications).some(v => v)`. This will false-positive on an empty `customMedications: []` array (arrays are truthy). Update to:

```ts
case 'infiltrationMedications':
  return !!(intraOpData.infiltration && Object.values(intraOpData.infiltration).some(v => v)) ||
         !!(intraOpData.medications && Object.values(intraOpData.medications).some(v => v && !(Array.isArray(v) && v.length === 0))) ||
         !!(intraOpData.medications?.customMedications && intraOpData.medications.customMedications.length > 0);
```

- [ ] **Step 7: Run TypeScript check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/anesthesia/op/IntraOpTab.tsx
git commit -m "feat: add dynamic custom medications to infiltration card with inventory tracking"
```

---

### Task 4: Manual Testing & Polish

**Files:**
- Possibly: `client/src/pages/anesthesia/op/IntraOpTab.tsx` (minor adjustments)

- [ ] **Step 1: Start dev server and test the flow**

Run: `npm run dev`

Test checklist:
1. Open a surgery → Intraoperative tab → expand "Infiltration & Medications"
2. Verify existing hardcoded medications still work (check a box, enter volume, save)
3. Click "Add medication..." button → search popover opens
4. Type a medication name → results filter
5. Select an item → it appears as a new row with volume input
6. Enter a volume → blur saves
7. Click "x" to remove → row disappears
8. Switch to Inventory tab → verify the item appears with qty 1 pending
9. Remove the medication → verify inventory usage shows qty 0
10. Add medication again → commit in Inventory tab → verify stock deducted
11. Reload the page → verify custom medications persist

- [ ] **Step 2: Fix any issues found**

Address any UI/UX issues: spacing, alignment, responsiveness on mobile.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix: polish custom medications UI"
```
