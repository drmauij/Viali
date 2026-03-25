# Dynamic Infiltration & Medications

## Problem

The Infiltration & Medications card (Surgery Documentation → Intraoperative tab) has a hardcoded list of 6 local anesthetics and 3 other medications. Different clinics use different medications (Kenacort-A 40, Lidocain Streuli, Carbostesin 0.25%, Natrium-Bicarbonat, etc.). Every addition requires a code change and deploy.

## Solution

Allow users to dynamically add medications from the hospital's inventory items to the Infiltration & Medications card, with automatic inventory tracking via the existing anesthesia record inventory system.

## Design

### Data Model

Extend the `intraOpData.medications` JSONB type in `shared/schema.ts` with a `customMedications` array:

```ts
medications?: {
  // existing boolean flags — unchanged
  rapidocain1?: boolean;
  ropivacain05?: boolean;
  ropivacain075?: boolean;
  ropivacain1?: boolean;
  bupivacain025?: boolean;
  bupivacain05?: boolean;
  vancomycinImplant?: boolean;
  contrast?: boolean;
  ointments?: boolean;
  other?: string;
  [key: string]: boolean | string | undefined;

  // new
  customMedications?: Array<{
    itemId: string;       // inventory item ID
    name: string;         // snapshot of item name at selection time
    volume?: string;      // optional volume in ml
    inventoryUsageId?: string; // reference to inventory_usage row for cleanup
  }>;
};
```

No DB migration needed — this is inside the existing JSONB field.

### Inventory Integration

Uses the **existing anesthesia inventory system** — no new inventory logic.

**On add (select from inventory):**
1. Add entry to `customMedications` array in intraOpData
2. Call `POST /api/anesthesia/inventory/:recordId/manual` with `{ itemId, quantity: 1 }`
3. Store the returned `inventory_usage` ID in the custom medication entry for cleanup reference
4. Item appears in the Inventory Tab as a pending item with qty 1

**On remove (click "x"):**
1. Remove entry from `customMedications` array
2. Call `PATCH /api/anesthesia/inventory/:id/override` with `{ overrideQty: 0 }` to zero out the pending inventory usage
3. Item shows as 0 in Inventory Tab (effectively removed from commit)

**On commit (existing flow, no changes):**
- User commits in the Inventory Tab as usual
- Stock is deducted, activity is logged
- Rollback restores stock — all existing mechanisms apply

**Quantity:** Always 1. If more was used, the user adjusts manually in the Inventory Tab. This avoids needing medication configuration on the surgery side.

### UI Changes

All changes in `IntraOpTab.tsx`.

**Additives section** — after the existing 6 checkboxes:
- Render `customMedications` entries as rows matching the existing style: medication name + volume input + "x" remove button
- A combobox at the bottom: type to search hospital inventory items by name, select to add

**Other Medications section** — after the existing 3 checkboxes:
- Same pattern: custom medication rows + combobox to add

Both sections share the same `customMedications` array. Each entry could optionally have a `section` field ("additive" | "other") to control which section it renders in, or we can keep it simple and show all custom medications in one place (after the additives section, before the "Other Medications" header).

**Recommended: single list after additives.** Simpler, avoids category confusion. The hardcoded "Other Medications" (Vancomycin, Contrast, Ointments) stay where they are.

### Item Search

Reuse the existing items API: `GET /api/items/:hospitalId?unitId=...`

The combobox fetches items on focus/type, filters client-side by name. Items already in `customMedications` are excluded from results to prevent duplicates.

No new API endpoint needed. If the full item list is too large for client-side filtering, we can add a `?search=` query parameter to the items endpoint later — but inventory lists are typically small enough.

### Backward Compatibility

- Existing records with `rapidocain1: true` etc. render exactly as before
- Hardcoded checkboxes remain unchanged
- `customMedications` defaults to `undefined` — old records are unaffected
- No data migration

### Files to Change

| File | Change |
|------|--------|
| `shared/schema.ts` | Extend `medications` type with `customMedications` array |
| `client/src/pages/anesthesia/op/IntraOpTab.tsx` | Add custom medication rows + search combobox |
| `client/src/i18n/locales/en.json` | Labels: "Add medication...", "Search inventory..." |
| `client/src/i18n/locales/de.json` | German translations |

### What We're NOT Doing

- No new DB table or migration
- No new API endpoint
- No medication configuration system for surgery
- No changes to the existing hardcoded medications
- No changes to the inventory commit/rollback mechanism
