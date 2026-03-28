# OR Configurable Medications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-configurable medication groups for the OR unit with quantity-based inventory calculation, replacing the fixed infiltration list.

**Architecture:** Extends existing `administrationGroups` + `medicationConfigs` tables with a `unitType` discriminator. New `orMedications` table records per-surgery usage. Automatic inventory calculation feeds the existing surgery inventory commit workflow. New card component on IntraOp tab with inline admin config, legacy card kept as fallback.

**Tech Stack:** PostgreSQL, Drizzle ORM, Express, React, TanStack Query, shadcn/ui, dnd-kit (drag-and-drop)

**Spec:** `docs/superpowers/specs/2026-03-28-or-configurable-medications-design.md`

---

### Task 1: Schema — Add unitType column and orMedications table

**Files:**
- Modify: `shared/schema.ts:208-216` (administrationGroups table)
- Create: Migration SQL file (via `npm run db:generate`)

- [ ] **Step 1: Add `unitType` to `administrationGroups` in schema**

In `shared/schema.ts`, find the `administrationGroups` table (line 208). Add `unitType` column:

```typescript
export const administrationGroups = pgTable("administration_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  unitType: varchar("unit_type").default("anesthesia"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_administration_groups_hospital").on(table.hospitalId),
]);
```

- [ ] **Step 2: Add `orMedications` table definition in schema**

In `shared/schema.ts`, after the `administrationGroups` table, add:

```typescript
export const orMedications = pgTable("or_medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id),
  itemId: varchar("item_id").notNull().references(() => items.id),
  groupId: varchar("group_id").notNull().references(() => administrationGroups.id, { onDelete: "cascade" }),
  quantity: varchar("quantity").notNull(),
  unit: varchar("unit").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_or_medications_record_item_group").on(table.anesthesiaRecordId, table.itemId, table.groupId),
]);
```

Add the insert/select types:

```typescript
export type OrMedication = typeof orMedications.$inferSelect;
export type InsertOrMedication = typeof orMedications.$inferInsert;
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`

- [ ] **Step 4: Make migration idempotent**

Open the generated migration SQL file. Ensure:
- `CREATE TABLE` uses `IF NOT EXISTS`
- `ALTER TABLE` uses `ADD COLUMN IF NOT EXISTS`
- Add backfill: `UPDATE administration_groups SET unit_type = 'anesthesia' WHERE unit_type IS NULL;`
- Unique index uses `IF NOT EXISTS`

Follow the pattern from existing migrations in `migrations/`.

- [ ] **Step 5: Run migration**

Run: `npm run db:migrate`

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add unitType to administrationGroups and orMedications table"
```

---

### Task 2: Storage — Modify existing admin group functions + add OR medication CRUD

**Files:**
- Modify: `server/storage/inventory.ts:555-626` (getAdministrationGroups, createAdministrationGroup)
- Modify: `server/storage/anesthesia.ts` (add new functions)

- [ ] **Step 1: Add `unitType` filter to `getAdministrationGroups`**

In `server/storage/inventory.ts` (line 555), modify the function signature and query:

```typescript
export async function getAdministrationGroups(hospitalId: string, unitType?: string): Promise<AdministrationGroup[]> {
```

Add `unitType` filter to the WHERE clause. If `unitType` is provided, filter by it. If not, default to `'anesthesia'` for backward compatibility:

```typescript
const effectiveUnitType = unitType ?? 'anesthesia';
// add: .where(and(eq(administrationGroups.hospitalId, hospitalId), eq(administrationGroups.unitType, effectiveUnitType)))
```

- [ ] **Step 2: Verify `createAdministrationGroup` handles unitType**

In `server/storage/inventory.ts` (line 569), the function takes `InsertAdministrationGroup`. Since the schema now has `unitType`, it will be included automatically when passed in the insert data. No code change needed — just verify the type includes `unitType`.

- [ ] **Step 3: Add OR medication storage functions**

In `server/storage/anesthesia.ts`, add the following functions at the end of the file:

```typescript
// --- OR Medications ---

export async function getOrMedications(anesthesiaRecordId: string) {
  return db
    .select({
      id: orMedications.id,
      anesthesiaRecordId: orMedications.anesthesiaRecordId,
      itemId: orMedications.itemId,
      itemName: items.name,
      groupId: orMedications.groupId,
      groupName: administrationGroups.name,
      quantity: orMedications.quantity,
      unit: orMedications.unit,
      notes: orMedications.notes,
      ampuleTotalContent: medicationConfigs.ampuleTotalContent,
      createdAt: orMedications.createdAt,
    })
    .from(orMedications)
    .leftJoin(items, eq(orMedications.itemId, items.id))
    .leftJoin(administrationGroups, eq(orMedications.groupId, administrationGroups.id))
    .leftJoin(medicationConfigs, eq(orMedications.itemId, medicationConfigs.itemId))
    .where(eq(orMedications.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(administrationGroups.sortOrder, orMedications.createdAt);
}

export async function upsertOrMedication(data: InsertOrMedication) {
  return db
    .insert(orMedications)
    .values(data)
    .onConflictDoUpdate({
      target: [orMedications.anesthesiaRecordId, orMedications.itemId, orMedications.groupId],
      set: {
        quantity: data.quantity,
        unit: data.unit,
        notes: data.notes,
      },
    })
    .returning();
}

export async function deleteOrMedication(anesthesiaRecordId: string, itemId: string, groupId: string) {
  return db
    .delete(orMedications)
    .where(
      and(
        eq(orMedications.anesthesiaRecordId, anesthesiaRecordId),
        eq(orMedications.itemId, itemId),
        eq(orMedications.groupId, groupId),
      )
    );
}
```

Add necessary imports at top of file: `orMedications`, `administrationGroups`, `items` from schema (some may already be imported).

- [ ] **Step 4: Add `calculateOrInventoryUsage` function**

In `server/storage/anesthesia.ts`, add:

```typescript
export async function calculateOrInventoryUsage(anesthesiaRecordId: string) {
  // 1. Fetch all OR medications for this record
  const meds = await db
    .select()
    .from(orMedications)
    .where(eq(orMedications.anesthesiaRecordId, anesthesiaRecordId));

  // 2. Group by itemId, sum quantities
  const itemTotals = new Map<string, { totalQty: number; unit: string }>();
  for (const med of meds) {
    const existing = itemTotals.get(med.itemId);
    const qty = parseFloat(med.quantity) || 0;
    if (existing) {
      existing.totalQty += qty;
    } else {
      itemTotals.set(med.itemId, { totalQty: qty, unit: med.unit });
    }
  }

  // 3. For each unique item, calculate inventory units
  const currentItemIds = new Set<string>();
  for (const [itemId, { totalQty }] of itemTotals) {
    if (totalQty <= 0) continue;
    currentItemIds.add(itemId);

    // Look up medicationConfig for ampuleTotalContent
    const [config] = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.itemId, itemId))
      .limit(1);

    let units: number;
    if (config?.ampuleTotalContent) {
      const ampuleQty = parseFloat(config.ampuleTotalContent) || 0;
      units = ampuleQty > 0 ? Math.ceil(totalQty / ampuleQty) : 1;
    } else {
      // No config — create as manual override so it shows in inventory tab
      const existingUsage = await getInventoryUsageByItem(anesthesiaRecordId, itemId);
      if (existingUsage) {
        await db
          .update(inventoryUsage)
          .set({
            overrideQty: String(Math.ceil(totalQty)),
            overrideReason: "OR medication (no config)",
            updatedAt: new Date(),
          })
          .where(eq(inventoryUsage.id, existingUsage.id));
      } else {
        await createManualInventoryUsage(
          anesthesiaRecordId,
          itemId,
          Math.ceil(totalQty),
          "OR medication (no config)",
          "system",
        );
      }
      continue;
    }

    // Upsert inventoryUsage with calculated qty
    const existingUsage = await getInventoryUsageByItem(anesthesiaRecordId, itemId);
    if (existingUsage) {
      await db
        .update(inventoryUsage)
        .set({ calculatedQty: String(units), updatedAt: new Date() })
        .where(eq(inventoryUsage.id, existingUsage.id));
    } else {
      await db.insert(inventoryUsage).values({
        anesthesiaRecordId,
        itemId,
        calculatedQty: String(units),
      });
    }
  }

  // 4. Remove inventoryUsage rows for items no longer in any OR medication
  // or items whose total quantity is now 0
  // Query all inventoryUsage rows for this record, check which ones have itemIds
  // that are NOT in currentItemIds. For those, check if the item also exists in
  // anesthesiaMedications — if it does, leave the row (anesthesia owns it).
  // If it doesn't, delete the inventoryUsage row.
  const allUsage = await db
    .select()
    .from(inventoryUsage)
    .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));

  for (const usage of allUsage) {
    if (currentItemIds.has(usage.itemId)) continue;
    // Check if this item exists in OR medications at all (might be from anesthesia)
    const orMed = meds.find(m => m.itemId === usage.itemId);
    if (!orMed) continue; // Not from OR system — leave it alone
    // Item was from OR but quantity is now 0 or item removed — delete usage row
    await db.delete(inventoryUsage).where(eq(inventoryUsage.id, usage.id));
  }
}
```

Note: step 4 cleanup needs care to not remove anesthesia-originated `inventoryUsage` rows. The implementer should check if the item still exists in `anesthesiaMedications` before removing. If it does, leave the row alone.

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 6: Commit**

```bash
git add server/storage/inventory.ts server/storage/anesthesia.ts
git commit -m "feat: add OR medication storage functions and inventory calculation"
```

---

### Task 3: Routes — Modify admin group endpoints + new OR medications routes

**Files:**
- Modify: `server/routes/anesthesia/settings.ts:278-340` (admin group GET/POST)
- Create: `server/routes/anesthesia/orMedications.ts`
- Modify: `server/routes/anesthesia/index.ts` (register new router)

- [ ] **Step 1: Add `unitType` query param to GET admin groups**

In `server/routes/anesthesia/settings.ts` (line 278), modify the GET handler:

```typescript
router.get("/api/administration-groups/:hospitalId", async (req, res) => {
  const { hospitalId } = req.params;
  const unitType = (req.query.unitType as string) || undefined;
  const groups = await storage.getAdministrationGroups(hospitalId, unitType);
  res.json(groups);
});
```

- [ ] **Step 2: Add `unitType` to POST admin group creation**

In `server/routes/anesthesia/settings.ts` (line 289), ensure the body includes `unitType`:

```typescript
router.post("/api/administration-groups", async (req, res) => {
  const { hospitalId, name, unitType } = req.body;
  const group = await storage.createAdministrationGroup({ hospitalId, name, unitType });
  res.json(group);
});
```

- [ ] **Step 3: Add unitType filtering to medication configs endpoint**

In `server/routes/anesthesia/settings.ts`, find the `GET /api/anesthesia/settings/medications/:hospitalId` endpoint. Modify it to accept an optional `unitType` query param and filter medication configs by their associated group's `unitType`. This ensures:
- Anesthesia Settings page (passing `unitType=anesthesia` or no param) sees only anesthesia medication configs
- OR card (passing `unitType=or`) sees only OR medication configs

The filter should join `medicationConfigs` → `administrationGroups` (by matching `medicationConfigs.administrationGroup` to `administrationGroups.name` within the same hospital) and filter by the group's `unitType`. Alternatively, since `medicationConfigs.administrationGroup` is free text, the simpler approach: fetch the group names for the given `unitType`, then filter configs where `administrationGroup IN (groupNames)`.

- [ ] **Step 4: Create OR medications route file**

Create `server/routes/anesthesia/orMedications.ts`:

```typescript
import { Router } from "express";
import * as storage from "../../storage/anesthesia";

const router = Router();

// GET all OR medications for a record
router.get("/api/or-medications/:anesthesiaRecordId", async (req, res) => {
  try {
    const { anesthesiaRecordId } = req.params;
    const medications = await storage.getOrMedications(anesthesiaRecordId);
    res.json(medications);
  } catch (error) {
    console.error("Error fetching OR medications:", error);
    res.status(500).json({ message: "Failed to fetch OR medications" });
  }
});

// PUT (upsert) an OR medication entry
router.put("/api/or-medications/:anesthesiaRecordId", async (req, res) => {
  try {
    const { anesthesiaRecordId } = req.params;
    const { itemId, groupId, quantity, unit, notes } = req.body;
    const result = await storage.upsertOrMedication({
      anesthesiaRecordId,
      itemId,
      groupId,
      quantity,
      unit,
      notes,
    });
    // Recalculate inventory
    await storage.calculateOrInventoryUsage(anesthesiaRecordId);
    res.json(result);
  } catch (error) {
    console.error("Error upserting OR medication:", error);
    res.status(500).json({ message: "Failed to save OR medication" });
  }
});

// DELETE an OR medication entry
router.delete("/api/or-medications/:anesthesiaRecordId/:itemId", async (req, res) => {
  try {
    const { anesthesiaRecordId, itemId } = req.params;
    const groupId = req.query.groupId as string;
    if (!groupId) {
      return res.status(400).json({ message: "groupId query param is required" });
    }
    await storage.deleteOrMedication(anesthesiaRecordId, itemId, groupId);
    // Recalculate inventory (item may still exist in another group)
    await storage.calculateOrInventoryUsage(anesthesiaRecordId);
    res.json({ message: "Deleted" });
  } catch (error) {
    console.error("Error deleting OR medication:", error);
    res.status(500).json({ message: "Failed to delete OR medication" });
  }
});

export default router;
```

- [ ] **Step 5: Register the new router**

In `server/routes/anesthesia/index.ts`, add:

```typescript
import orMedicationsRouter from "./orMedications";
```

And in the router chain:

```typescript
router.use(orMedicationsRouter);
```

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 7: Commit**

```bash
git add server/routes/anesthesia/settings.ts server/routes/anesthesia/orMedications.ts server/routes/anesthesia/index.ts
git commit -m "feat: add OR medications routes and unitType filter on admin groups and medication configs"
```

---

### Task 4: Frontend — New OR Medications Card component

**Files:**
- Create: `client/src/components/anesthesia/OrMedicationsCard.tsx`

This is the main new component. It handles both normal mode (quantity entry) and admin edit mode (CRUD).

- [ ] **Step 1: Create the card component**

Create `client/src/components/anesthesia/OrMedicationsCard.tsx`.

This component receives:
- `anesthesiaRecordId: string`
- `hospitalId: string`
- `unitId: string` (OR unit)
- `isAdmin: boolean`
- `hasLegacyData: boolean` (for dual-card warning)

It should:
1. Fetch OR administration groups via `GET /api/administration-groups/:hospitalId?unitType=or`
2. Fetch OR medications for this record via `GET /api/or-medications/:anesthesiaRecordId`
3. Fetch medication configs for OR groups (to get unit labels)
4. Render groups with medication rows and quantity inputs
5. Debounce quantity changes and PUT to save
6. Show empty state "Configure groups to get started" when no groups exist

Use TanStack Query for data fetching. Use shadcn/ui `Card`, `Input`, `Button`, `Collapsible` components. Match existing IntraOpTab styling patterns.

- [ ] **Step 2: Add admin edit mode toggle**

Add state `editMode: boolean` (only shown when `isAdmin` is true).

When `editMode` is active, render:
- Drag handles on groups (use `@dnd-kit/sortable` — check if already in package.json, install if needed)
- Rename/Delete buttons on group headers
- Edit/Remove buttons on medications
- "+ Add Medication" button per group
- "+ Add Group" button at bottom

Group CRUD calls existing endpoints:
- `POST /api/administration-groups` with `unitType: 'or'`
- `PUT /api/administration-groups/:groupId`
- `DELETE /api/administration-groups/:groupId`
- `PUT /api/administration-groups/reorder`

- [ ] **Step 3: Add medication config dialog**

When admin clicks "+ Add Medication", show a dialog with:
- Inventory item search combobox (reuse existing pattern from IntraOpTab line 1691)
- Content per unit input (maps to `ampuleTotalContent`)
- Unit selector
- Optional default quantity

On save, create/update a `medicationConfig` via the existing `POST /api/anesthesia/settings/medications` endpoint, setting `administrationGroup` to the OR group name.

- [ ] **Step 4: Add dual-card warning banner**

If `hasLegacyData` is true AND this card has OR medication entries, render the warning banner:

```tsx
<Alert variant="warning">
  <AlertTriangle className="h-4 w-4" />
  <AlertDescription>
    {t('surgery.intraop.dualCardWarning')}
  </AlertDescription>
</Alert>
```

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/OrMedicationsCard.tsx
git commit -m "feat: add OrMedicationsCard component with admin edit mode"
```

---

### Task 5: Frontend — Integrate card into IntraOpTab + legacy card dimming

**Files:**
- Modify: `client/src/pages/anesthesia/op/IntraOpTab.tsx:1464+` (infiltration section)
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Import and render OrMedicationsCard**

In `IntraOpTab.tsx`, find the infiltration section (around line 1464). Before the existing infiltration content, add the new card:

```tsx
import { OrMedicationsCard } from "@/components/anesthesia/OrMedicationsCard";
```

Determine `hasLegacyData` by checking:
```typescript
const hasLegacyData = !!(
  intraOpData.medications?.rapidocain1 ||
  intraOpData.medications?.ropivacainEpinephrine ||
  // ... other boolean fields
  (intraOpData.medications?.customMedications?.length ?? 0) > 0 ||
  intraOpData.infiltration?.tumorSolution
);
```

Render new card above legacy:
```tsx
<OrMedicationsCard
  anesthesiaRecordId={recordId}
  hospitalId={hospitalId}
  unitId={unitId}
  isAdmin={isAdmin}
  hasLegacyData={hasLegacyData}
/>
```

- [ ] **Step 2: Wrap legacy card with smart visibility**

Fetch OR groups count to determine display state. If OR groups exist for the hospital, dim and collapse the legacy card:

```tsx
const { data: orGroups } = useQuery({
  queryKey: ["/api/administration-groups", hospitalId, "or"],
  queryFn: () => fetch(`/api/administration-groups/${hospitalId}?unitType=or`).then(r => r.json()),
});

const hasOrGroups = (orGroups?.length ?? 0) > 0;
```

Wrap existing infiltration content in a collapsible with dimmed styling:
```tsx
<div className={cn(hasOrGroups && "opacity-50")}>
  <Collapsible defaultOpen={!hasOrGroups}>
    <CollapsibleTrigger>
      <span>{t('surgery.intraop.infiltrationLegacy')}</span>
    </CollapsibleTrigger>
    <CollapsibleContent>
      {/* existing infiltration/medications content */}
    </CollapsibleContent>
  </Collapsible>
</div>
```

- [ ] **Step 3: Add i18n labels**

Add to `en.json` and `de.json` the new keys:
- `surgery.intraop.orMedications` — "Infiltration & Medications"
- `surgery.intraop.orMedicationsNew` — "Configurable Groups"
- `surgery.intraop.infiltrationLegacy` — "Infiltration & Medications (Legacy)"
- `surgery.intraop.configureGroups` — "Configure groups to get started"
- `surgery.intraop.editMode` — "Edit Mode"
- `surgery.intraop.exitEditMode` — "Exit Edit Mode"
- `surgery.intraop.addGroup` — "Add Group"
- `surgery.intraop.addMedication` — "Add Medication"
- `surgery.intraop.dualCardWarning` — "Medications have been recorded in both the new card and the legacy card for this record. Please use only one system per record to avoid duplicate inventory entries."
- German translations for all of the above

- [ ] **Step 4: TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/anesthesia/op/IntraOpTab.tsx client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat: integrate OrMedicationsCard into IntraOpTab with legacy dimming"
```

---

### Task 6: Integration testing

**Files:**
- Create: `tests/or-medications.test.ts`

- [ ] **Step 1: Write tests for admin group CRUD with unitType**

```typescript
describe("Administration Groups with unitType", () => {
  test("GET filters by unitType - returns only anesthesia groups by default");
  test("GET with unitType=or returns only OR groups");
  test("POST creates group with unitType=or");
  test("existing anesthesia groups are not affected by OR operations");
});
```

- [ ] **Step 2: Write tests for OR medications CRUD**

```typescript
describe("OR Medications CRUD", () => {
  test("PUT creates new OR medication entry");
  test("PUT upserts when same item+group+record exists");
  test("GET returns medications with item names and group names");
  test("DELETE with groupId removes specific entry");
  test("DELETE without groupId returns 400");
});
```

- [ ] **Step 3: Write tests for inventory calculation**

```typescript
describe("OR Inventory Calculation", () => {
  test("2000ml used / 1000ml config = 2 units in inventoryUsage");
  test("15ml used / 20ml config = 1 unit (ceil)");
  test("same item in multiple groups sums quantities before calculating");
  test("missing medicationConfig creates manual override entry");
  test("zero quantity removes inventoryUsage row");
  test("DELETE triggers recalculation - item in other group still counted");
});
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run tests/or-medications.test.ts`
Expected: all pass

- [ ] **Step 5: Run full TypeScript check and lint**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 6: Commit**

```bash
git add tests/or-medications.test.ts
git commit -m "test: add integration tests for OR configurable medications"
```

---

### Task 7: Manual verification and cleanup

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify backward compatibility**

1. Open an existing surgery record → Intraoperative tab
2. Verify legacy infiltration card still works as before
3. Open Anesthesia Settings → verify no OR groups leak into the anesthesia groups list
4. Verify existing anesthesia medication timeline is unaffected

- [ ] **Step 3: Test admin flow**

1. Log in as admin
2. Open a surgery record → Intraoperative tab
3. See the new card with "Configure groups to get started" message
4. Click edit mode toggle
5. Create a group (e.g., "Tumescent Solution")
6. Add medications from inventory with ampuleTotalContent set
7. Exit edit mode
8. Enter quantities for medications
9. Navigate to surgery inventory tab — verify calculated units appear

- [ ] **Step 4: Test dual-card warning**

1. On the same record, expand legacy card and toggle a medication on
2. Verify warning banner appears on the new card
3. Remove the legacy medication — verify warning disappears

- [ ] **Step 5: Final TypeScript check**

Run: `npm run check`
Expected: clean pass

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup and polish OR configurable medications"
```
