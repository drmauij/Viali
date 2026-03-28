# OR Configurable Medications System

## Problem

The Infiltration & Medications card (Surgery Documentation → Intraoperative tab) uses a hardcoded fixed list of medications plus a hybrid add-from-inventory feature that always counts +1 per item. Clinics need to:

1. See only the medications they actually use, organized in meaningful groups
2. Enter actual quantities used (not just toggle on/off)
3. Get accurate inventory consumption calculation (e.g., 2000 ml Ringer used / 1000 ml per unit = 2 units deducted)

The anesthesia record already solves this with admin-configured Administration Groups and Medication Configs. This design brings the same pattern to the OR/surgery side.

## Solution

Admin-configurable medication groups for the OR unit, rendered inline on the Intraoperative tab. Admins configure groups and medications directly on the card via an edit mode toggle. Users enter quantities, and the system automatically calculates inventory units for the existing surgery inventory commit workflow.

The current infiltration card stays available as a legacy fallback during the transition period.

## Design

### Data Model

#### 1. New column on `administrationGroups`

```sql
ALTER TABLE administration_groups
ADD COLUMN IF NOT EXISTS unit_type VARCHAR DEFAULT 'anesthesia';
```

Values: `'anesthesia'` | `'or'`

Migration backfills all existing rows to `'anesthesia'`. No impact on existing anesthesia groups or the Anesthesia Settings page.

The `medicationConfigs` table needs no changes. Note: `medicationConfigs.administrationGroup` is a free-text VARCHAR (stores group names, not a FK to `administrationGroups.id`). For OR medications, the `group_id` on `or_medications` handles group assignment directly. The medication config is per-item (globally unique via `itemId`), not per-group — so `ampuleTotalContent` is the same regardless of which group the item appears in. The `group_id` on `or_medications` is purely for UI grouping; config lookup uses only `itemId`.

#### 2. New table: `or_medications`

```sql
CREATE TABLE IF NOT EXISTS or_medications (
  id VARCHAR PRIMARY KEY,
  anesthesia_record_id VARCHAR NOT NULL REFERENCES anesthesia_records(id),
  item_id VARCHAR NOT NULL REFERENCES items(id),
  group_id VARCHAR NOT NULL REFERENCES administration_groups(id) ON DELETE CASCADE,
  quantity VARCHAR NOT NULL,
  unit VARCHAR NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(anesthesia_record_id, item_id, group_id)
);
```

One entry per item per group per record. If the user changes quantity, it updates in place (upsert).

#### 3. No changes to existing tables

- `medicationConfigs` — unchanged. Same config structure for both anesthesia and OR medications.
- `inventoryUsage` — unchanged. OR entries go here via the calculation step.
- `inventoryCommits` — unchanged. Commit/deduction workflow remains identical.
- Legacy JSONB (`intraOpData.infiltration`, `intraOpData.medications`) — untouched. Legacy card keeps reading/writing JSONB as before.

### Inventory Calculation

Triggered automatically on every medication entry save (PUT endpoint).

```
1. Fetch all orMedications for the record
2. Group entries by itemId (same item can appear in multiple groups)
3. For each unique itemId:
   a. Sum quantities across all groups for this item
   b. Look up medicationConfig for the itemId
   c. Get ampuleTotalContent (e.g., "1000 ml"), parse numeric value
   d. units = Math.ceil(totalQuantity / ampuleTotalContent)
   e. Upsert inventoryUsage: { anesthesiaRecordId, itemId, calculatedQty: units }
4. Remove inventoryUsage rows for items no longer in any orMedication entry
```

Note: `inventoryUsage` has a unique constraint on `(anesthesiaRecordId, itemId)` — only one row per item per record. The calculation must sum across groups before upserting.

**Example:**
- Ringer used: 2000 ml / config 1000 ml = **2 units**
- Ropivacain used: 15 ml / config 20 ml = **1 unit** (ceil)

**Edge cases:**
- No `medicationConfig` found → create `inventoryUsage` with `overrideQty` and reason "OR medication (no config)" so it still appears in inventory tab for manual adjustment
- `ampuleTotalContent` is 0 or unparseable → default to 1 unit per entry
- Quantity is empty or 0 → remove `inventoryUsage` row for this item

### API

#### Modified existing endpoints

**`GET /api/administration-groups/:hospitalId`**
- New query param: `?unitType=anesthesia|or`
- Filters groups by unit type. Defaults to `'anesthesia'` for backward compatibility.

**`POST /api/administration-groups`**
- New body field: `unitType` (required)
- Creates group with specified unit type.

**`GET /api/anesthesia/settings/medications/:hospitalId`**
- Filters by group's `unitType` when fetching configs.
- Anesthesia settings page sees only anesthesia configs, OR card sees only OR configs.

#### New endpoints — OR Medications CRUD

**`GET /api/or-medications/:anesthesiaRecordId`**

Returns all OR medication entries for a record, joined with item name and medicationConfig.

Response: `Array<{ id, itemId, itemName, groupId, groupName, quantity, unit, ampuleTotalContent, notes }>`

**`PUT /api/or-medications/:anesthesiaRecordId`**

Upsert medication entry. If `(recordId, itemId, groupId)` exists, updates quantity.

Body: `{ itemId, groupId, quantity, unit, notes? }`

Side effect: triggers `calculateOrInventoryUsage()` for this item.

**`DELETE /api/or-medications/:anesthesiaRecordId/:itemId?groupId=:groupId`**

Removes medication entry. `groupId` query param is required since the same item can exist in multiple groups (unique constraint includes `group_id`).

Side effect: triggers `calculateOrInventoryUsage()` to recalculate — the item may still exist in another group, so a simple row removal would be incorrect.

### Storage Functions

```ts
// New — OR Medications CRUD
getOrMedications(anesthesiaRecordId: string)
upsertOrMedication(data: InsertOrMedication)
deleteOrMedication(anesthesiaRecordId: string, itemId: string, groupId: string)

// New — Inventory calculation
calculateOrInventoryUsage(anesthesiaRecordId: string)

// Modified existing — add unitType filter
getAdministrationGroups(hospitalId: string, unitType?: string)
createAdministrationGroup(group: InsertAdministrationGroup)  // now includes unitType
```

### UI

#### Card placement on IntraOp tab

Two cards in the Infiltration & Medications section:

1. **New card** (prominent) — shows admin-configured OR groups with medication rows and quantity inputs
2. **Legacy card** (dimmed, collapsed) — the existing fixed list, accessible by expanding

**Smart default state:**

| Condition | New card | Legacy card |
|-----------|----------|-------------|
| Hospital has OR groups configured | Expanded, prominent | Collapsed, dimmed |
| No OR groups yet | Shows "Configure groups to get started" prompt | Expanded, normal styling |
| Old record with legacy JSONB data | Normal state | Always expandable to view historical data |

#### Normal mode (all users)

Each OR group renders as a collapsible section:
- Group name header with medication count
- Medication rows: item name, quantity input field, unit label (from config)
- Clean, minimal — no admin controls visible

#### Admin edit mode

Admin-only toggle on the card header. When active:
- Drag handles on groups for reordering
- Rename / Delete buttons on each group header
- Drag handles on medications within groups for reordering
- Edit / Remove buttons on each medication
- "+ Add Medication" button at bottom of each group → opens dialog
- "+ Add Group" button at bottom of card

**Add Medication dialog:**
- Inventory item search (same pattern as existing combobox)
- Content per unit (maps to `ampuleTotalContent` on `medicationConfig`)
- Unit selector (ml, mg, units, etc.)
- Optional default quantity (pre-fills for users)

#### Dual-card warning

If both the new card and legacy card have data for the same record, a warning banner appears:

> "Medications have been recorded in both the new card and the legacy card for this record. Please use only one system per record to avoid duplicate inventory entries."

Detection: new card has data if `orMedications` rows exist for the record. Legacy card has data if `intraOpData.medications` has any truthy values or `customMedications.length > 0`.

### Backward Compatibility

| Area | Impact |
|------|--------|
| Existing anesthesia groups | Zero — `unitType` defaults to `'anesthesia'`, all queries filtered |
| Existing surgery records | Zero — legacy JSONB untouched, legacy card still works |
| Anesthesia Settings page | Zero — passes `unitType='anesthesia'`, sees no OR groups |
| Existing inventory flow | Zero — legacy custom medications still create +1 entries via existing code |
| Existing `medicationConfigs` | Zero — no schema change, group's `unitType` determines context |

### Migration

All statements idempotent:

```sql
-- Step 1: Add unitType column
ALTER TABLE administration_groups
ADD COLUMN IF NOT EXISTS unit_type VARCHAR DEFAULT 'anesthesia';

-- Step 2: Backfill
UPDATE administration_groups SET unit_type = 'anesthesia' WHERE unit_type IS NULL;

-- Step 3: Create orMedications table
CREATE TABLE IF NOT EXISTS or_medications (
  id VARCHAR PRIMARY KEY,
  anesthesia_record_id VARCHAR NOT NULL REFERENCES anesthesia_records(id),
  item_id VARCHAR NOT NULL REFERENCES items(id),
  group_id VARCHAR NOT NULL REFERENCES administration_groups(id) ON DELETE CASCADE,
  quantity VARCHAR NOT NULL,
  unit VARCHAR NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(anesthesia_record_id, item_id, group_id)
);
```

### Rollout Strategy

1. **Deploy** — both cards visible. New card empty (no OR groups configured). Legacy card expanded by default.
2. **Admin configures** — admin enters edit mode, creates groups, adds medications. New card starts showing content.
3. **Staff adopts** — users enter quantities on new card. Inventory tab shows calculated units. Legacy card collapses by default.
4. **Legacy hidden** — once clinic confirms full adoption, legacy card can be hidden (future toggle or removal).

### Testing

| Area | Tests |
|------|-------|
| Admin CRUD | Create/rename/delete/reorder OR groups. Add/edit/remove medications under groups. Verify unitType filtering (OR groups don't appear in anesthesia settings). |
| Medication entry | Enter quantity → `orMedications` row created. Update quantity → upsert. Clear quantity → row removed. |
| Inventory calc | 2000ml / 1000ml config = 2 units. 15ml / 20ml config = 1 unit (ceil). Missing config = fallback. Zero quantity = removal. |
| Backward compat | Existing anesthesia groups unaffected. Legacy infiltration card still works. Old records display correctly. |
| Dual-card warning | Enter data in both cards → warning shown. Enter data in only one → no warning. |
| Inventory commit | OR medication entries appear in surgery inventory tab. Commit deducts correct stock. Rollback restores. |

### Files to Change

| File | Change |
|------|--------|
| `shared/schema.ts` | Add `orMedications` table definition, add `unitType` to `administrationGroups` |
| `server/storage/inventory.ts` | Add `unitType` param to `getAdministrationGroups`, `createAdministrationGroup` |
| `server/storage/anesthesia.ts` | Add `getOrMedications`, `upsertOrMedication`, `deleteOrMedication`, `calculateOrInventoryUsage` |
| `server/routes/anesthesia/inventory.ts` | Add `unitType` query param to admin group endpoints |
| `server/routes/or-medications.ts` (new) | GET/PUT/DELETE for OR medications |
| `client/src/pages/anesthesia/op/IntraOpTab.tsx` | New OR medications card component, admin edit mode, legacy card dimming |
| `client/src/i18n/locales/en.json` | Labels for new card, admin controls, warning |
| `client/src/i18n/locales/de.json` | German translations |
| Migration SQL | `unitType` column + `or_medications` table |

### What We're NOT Doing

- No changes to the anesthesia medication timeline or its configuration
- No data migration of existing JSONB infiltration data to the new system
- No removal of the legacy card (it stays available)
- No changes to the inventory commit/rollback mechanism
- No new inventory tables
