# Dynamic Infiltration & Medications

## Problem

The Infiltration & Medications card (Surgery Documentation → Intraoperative tab) has a hardcoded list of 6 local anesthetics and 3 other medications. Different clinics use different medications (Kenacort-A 40, Lidocain Streuli, Carbostesin 0.25%, Natrium-Bicarbonat, etc.). Every addition requires a code change and deploy.

## Solution

Allow users to dynamically add medications from the hospital's inventory items to the Infiltration & Medications card, with automatic inventory tracking via the existing anesthesia record inventory system.

## Design

### Data Model

**JSONB `$type` in `shared/schema.ts` (line 1280)** — extend the existing `medications` type:

```ts
medications?: {
  // existing fields — unchanged
  ropivacain?: boolean;
  bupivacain?: boolean;
  contrast?: boolean;
  ointments?: boolean;
  other?: string;

  // new
  customMedications?: Array<{
    itemId: string;       // inventory item ID
    name: string;         // snapshot of item name at selection time
    volume?: string;      // optional volume in ml
  }>;
};
```

**Zod schema `updateIntraOpDataSchema` (line 2905)** — add `customMedications` to the `medications` z.object and add `.passthrough()` so existing dynamic volume keys (e.g. `rapidocain1Volume`) are not stripped:

```ts
medications: z.object({
  // ... existing fields ...
  customMedications: z.array(z.object({
    itemId: z.string(),
    name: z.string(),
    volume: z.string().optional().nullable(),
  })).optional(),
}).passthrough().optional(),
```

**Merge logic in `records.ts` (line 513)** — the current spread `{ ...existingData.medications, ...validated.medications }` works for flat boolean keys but will overwrite `customMedications` array entirely on each save, which is the correct behavior (the client always sends the full array).

No DB migration needed — this is inside the existing JSONB field.

### Inventory Integration

Uses the **existing anesthesia inventory system** — no new inventory logic.

**On add (select from inventory):**
1. Add entry to `customMedications` array in intraOpData
2. Call `POST /api/anesthesia/inventory/:recordId/manual` with `{ itemId, qty: 1, reason: "Infiltration medication" }`
3. Item appears in the Inventory Tab as a pending item with qty 1

**On remove (click "x"):**
1. Remove entry from `customMedications` array
2. Look up the `inventory_usage` row by `(anesthesiaRecordId, itemId)` — more resilient than storing an ID that could become stale
3. Call `PATCH /api/anesthesia/inventory/:id/override` with `{ overrideQty: 0, overrideReason: "Removed from infiltration medications" }`
4. Item shows as 0 in Inventory Tab (effectively removed from commit)

**On commit (existing flow, no changes):**
- User commits in the Inventory Tab as usual
- Stock is deducted, activity is logged
- Rollback restores stock — all existing mechanisms apply

**Quantity:** Always 1. If more was used, the user adjusts manually in the Inventory Tab. This avoids needing medication configuration on the surgery side.

### Edge Cases

**Same item in anesthesia drug doses AND infiltration card:** The `inventory_usage` table has a unique constraint on `(anesthesiaRecordId, itemId)`. If the same item is already tracked via anesthesia drug doses (auto-calculated), calling the manual endpoint will upsert and overwrite the calculated qty with `overrideQty: 1`. This is acceptable — the user can adjust in the Inventory Tab. In practice this collision is unlikely since infiltration medications (local anesthetics for the surgical site) are rarely the same items configured in the anesthesia medication timeline.

**Removing after commit:** If inventory has already been committed, clicking "x" on a custom medication only zeroes the pending `inventory_usage` row. The committed stock deduction is not reversed. User must rollback from the Inventory Tab if needed. The "x" button remains enabled regardless — the JSONB documentation and inventory tracking are separate concerns.

**Recalculation safety:** `createManualInventoryUsage` sets `overrideQty`, and `calculateInventoryUsage` preserves rows with non-null `overrideQty`. So infiltration medication entries survive recalculation cycles.

### UI Changes

All changes in `IntraOpTab.tsx`.

**Additives section** — after the existing 6 checkboxes + epinephrine:
- Render `customMedications` entries as rows matching the existing style: medication name + volume input + "x" remove button
- A combobox at the bottom: type to search hospital inventory items by name, select to add

**Placement:** Single list of custom medications after the additives section, before the "Other Medications" divider. Simpler than splitting across sections.

### Item Search

Reuse the existing items API: `GET /api/items/:hospitalId?unitId=...`

The combobox fetches items on focus/type, filters client-side by name. Items already in `customMedications` are excluded from results to prevent duplicates.

Need to determine the correct `unitId` — the infiltration card is in Surgery Documentation context. Use the surgery unit's ID from the anesthesia record's associated surgery, or fetch items across all units for the hospital.

### Backward Compatibility

- Existing records with `rapidocain1: true` etc. render exactly as before
- Hardcoded checkboxes remain unchanged
- `customMedications` defaults to `undefined` — old records are unaffected
- No data migration

### Files to Change

| File | Change |
|------|--------|
| `shared/schema.ts` (line 1280) | Extend `medications` JSONB `$type` with `customMedications` array |
| `shared/schema.ts` (line 2905) | Add `customMedications` to Zod schema + `.passthrough()` |
| `client/src/pages/anesthesia/op/IntraOpTab.tsx` | Add custom medication rows + search combobox + inventory API calls |
| `client/src/i18n/locales/en.json` | Labels: "Add medication...", "Search inventory..." |
| `client/src/i18n/locales/de.json` | German translations |

### What We're NOT Doing

- No new DB table or migration
- No new API endpoint
- No medication configuration system for surgery
- No changes to the existing hardcoded medications
- No changes to the inventory commit/rollback mechanism
