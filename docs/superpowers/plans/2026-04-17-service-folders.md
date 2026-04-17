# Service Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the same flat-folder organization to `/inventory/services` that `/inventory/items` already has, via a reusable `<FolderTree>` component extracted from the Items page, and integrated with the existing services bulk-action bar.

**Architecture:** New `service_folders` table mirroring the existing `folders` table. New `folder_id` FK on `clinic_services`. Backend routes and storage mirror the inventory folder pattern. Frontend extracts the drag-drop folder tree out of `Items.tsx` into a reusable `client/src/components/folders/` package that takes a typed adapter, then both Items and Services consume it.

**Tech Stack:** Drizzle ORM, Express, React + @tanstack/react-query, @dnd-kit, Vitest, react-i18next.

**Spec:** `docs/superpowers/specs/2026-04-17-service-folders-design.md`

---

## File Structure

### Created
- `shared/schema.ts` — add `serviceFolders` table + `folderId` on `clinicServices` + zod `insertServiceFolderSchema` (modify)
- `migrations/0224_service_folders.sql` — idempotent migration
- `server/storage/clinic.ts` — add `getServiceFolders / getServiceFolder / createServiceFolder / updateServiceFolder / deleteServiceFolder / bulkMoveServicesToFolder` (modify)
- `server/routes/clinic.ts` — add 5 folder routes + `bulk-move-to-folder` route (modify)
- `tests/clinic-service-folders.test.ts` — integration tests
- `client/src/components/folders/types.ts` — `Folder`, `FolderItem`, `FolderAdapter`
- `client/src/components/folders/useFolderMutations.ts` — generic mutations hook
- `client/src/components/folders/useFolderTreeState.ts` — UI state hook
- `client/src/components/folders/FolderDialog.tsx` — create/rename modal
- `client/src/components/folders/FolderTree.tsx` — tree + dnd-kit primitives
- `client/src/components/folders/index.ts` — exports

### Modified
- `client/src/pages/Items.tsx` + `client/src/pages/items/*` — switch folder UI to shared component, remove duplicate folder-tree code
- `client/src/pages/clinic/Services.tsx` — add sidebar + folder filtering + "Move to folder" bulk action
- `client/src/i18n/locales/en.json` + `de.json` — new `folders.*` + `clinic.services.bulkMoveToFolder*` keys

---

## Task 1: DB schema — add `serviceFolders` table + `folderId` on services

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0224_service_folders.sql`

- [ ] **Step 1: Add `serviceFolders` table + `folderId` column + zod schema in `shared/schema.ts`**

Insert after `clinicServices` table definition (near line 3962):

```ts
// Folders for organizing clinic services (parallel to items `folders`)
export const serviceFolders = pgTable("service_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  name: varchar("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_service_folders_hospital").on(table.hospitalId),
  index("idx_service_folders_unit").on(table.unitId),
]);
```

Add `folderId` column to the existing `clinicServices` definition (just below `serviceGroups`):

```ts
  folderId: varchar("folder_id").references(() => serviceFolders.id),
```

Add index in the `clinicServices` table config block:

```ts
  index("idx_clinic_services_folder").on(table.folderId),
```

Add insert schema + types (near `insertFolderSchema`):

```ts
export const insertServiceFolderSchema = createInsertSchema(serviceFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ServiceFolder = typeof serviceFolders.$inferSelect;
export type InsertServiceFolder = z.infer<typeof insertServiceFolderSchema>;
```

- [ ] **Step 2: Create idempotent migration `migrations/0224_service_folders.sql`**

```sql
-- Migration: 0224_service_folders
-- Adds service_folders table and folder_id column on clinic_services.
-- All statements are idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS "service_folders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL,
  "unit_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_folders_hospital_id_hospitals_id_fk' AND conrelid = 'service_folders'::regclass) THEN
    ALTER TABLE "service_folders" ADD CONSTRAINT "service_folders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_folders_unit_id_units_id_fk' AND conrelid = 'service_folders'::regclass) THEN
    ALTER TABLE "service_folders" ADD CONSTRAINT "service_folders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_service_folders_hospital" ON "service_folders" ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_service_folders_unit" ON "service_folders" ("unit_id");

ALTER TABLE "clinic_services" ADD COLUMN IF NOT EXISTS "folder_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_services_folder_id_service_folders_id_fk' AND conrelid = 'clinic_services'::regclass) THEN
    ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_folder_id_service_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "service_folders"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_clinic_services_folder" ON "clinic_services" ("folder_id");
```

- [ ] **Step 3: Add journal entry + apply migration**

Run: `npm run db:generate` — Drizzle will produce a `.sql` file + journal entry. Overwrite the generated `.sql` with the idempotent file above, keeping the journal entry.

Run: `npx drizzle-kit push`
Expected: "No changes detected" (since we already have the column/table created locally) OR "Changes applied" if fresh DB.

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(service-folders): schema + idempotent migration"
```

---

## Task 2: Backend storage — service folder CRUD + bulk move

**Files:**
- Modify: `server/storage/clinic.ts`

- [ ] **Step 1: Add imports at the top of `server/storage/clinic.ts`**

Add to the existing `from "@shared/schema"` import block:

```ts
  serviceFolders,
  clinicServices,
  type ServiceFolder,
  type InsertServiceFolder,
```

Ensure `db, eq, and, asc, inArray, sql` from `drizzle-orm` and `../db` are already imported (most of them will be — add what's missing).

- [ ] **Step 2: Append storage functions to `server/storage/clinic.ts`**

```ts
// ---------- Service Folders ----------

export async function getServiceFolders(hospitalId: string, unitId: string): Promise<ServiceFolder[]> {
  return await db
    .select()
    .from(serviceFolders)
    .where(and(eq(serviceFolders.hospitalId, hospitalId), eq(serviceFolders.unitId, unitId)))
    .orderBy(asc(serviceFolders.sortOrder), asc(serviceFolders.name));
}

export async function getServiceFolder(id: string): Promise<ServiceFolder | undefined> {
  const [row] = await db.select().from(serviceFolders).where(eq(serviceFolders.id, id));
  return row;
}

export async function createServiceFolder(folder: InsertServiceFolder): Promise<ServiceFolder> {
  const [created] = await db.insert(serviceFolders).values(folder).returning();
  return created;
}

export async function updateServiceFolder(id: string, updates: Partial<ServiceFolder>): Promise<ServiceFolder> {
  const [updated] = await db
    .update(serviceFolders)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(serviceFolders.id, id))
    .returning();
  return updated;
}

export async function deleteServiceFolder(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(clinicServices)
      .set({ folderId: null })
      .where(eq(clinicServices.folderId, id));
    await tx.delete(serviceFolders).where(eq(serviceFolders.id, id));
  });
}

export async function bulkMoveServicesToFolder(
  hospitalId: string,
  serviceIds: string[],
  folderId: string | null,
): Promise<number> {
  if (serviceIds.length === 0) return 0;
  const result = await db
    .update(clinicServices)
    .set({ folderId, updatedAt: new Date() })
    .where(and(
      eq(clinicServices.hospitalId, hospitalId),
      inArray(clinicServices.id, serviceIds),
    ))
    .returning({ id: clinicServices.id });
  return result.length;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add server/storage/clinic.ts
git commit -m "feat(service-folders): storage layer"
```

---

## Task 3: Backend routes — folder CRUD + bulk-move-to-folder

**Files:**
- Modify: `server/routes/clinic.ts`

- [ ] **Step 1: Identify the existing clinic services routes**

Run: `grep -n "services\|bulk-move\|bulk-update-group" server/routes/clinic.ts | head -40`

Locate the registrar (usually a `router.get('/api/clinic/:hospitalId/services', …)` block). Add the new routes immediately after the existing services routes for proximity.

- [ ] **Step 2: Add imports at the top of `server/routes/clinic.ts`**

Add to the existing `from "@shared/schema"` import (if not already present):

```ts
import { insertServiceFolderSchema } from "@shared/schema";
```

Ensure the storage import pulls the new functions (most files import `* as storage from "../storage"` — if so this is automatic; otherwise add direct imports).

- [ ] **Step 3: Add the 5 folder routes to `server/routes/clinic.ts`**

Paste this block after the existing services routes:

```ts
// ---------- Service Folders ----------

router.get('/api/clinic/:hospitalId/service-folders', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    if (!unitId) return res.status(400).json({ message: "unitId is required" });
    const folders = await storage.getServiceFolders(hospitalId, unitId as string);
    res.json(folders);
  } catch (error) {
    logger.error("Error fetching service folders:", error);
    res.status(500).json({ message: "Failed to fetch service folders" });
  }
});

router.post('/api/clinic/:hospitalId/service-folders', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const parsed = insertServiceFolderSchema.parse({ ...req.body, hospitalId });
    const folder = await storage.createServiceFolder(parsed);
    res.status(201).json(folder);
  } catch (error) {
    logger.error("Error creating service folder:", error);
    res.status(500).json({ message: "Failed to create service folder" });
  }
});

router.patch('/api/clinic/:hospitalId/service-folders/bulk-sort', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { folders } = req.body as { folders: { id: string; sortOrder: number }[] };
    if (!Array.isArray(folders)) return res.status(400).json({ message: "folders array required" });

    let updatedCount = 0;
    for (const f of folders) {
      if (!f.id || f.sortOrder === undefined) continue;
      const existing = await storage.getServiceFolder(f.id);
      if (!existing || existing.hospitalId !== hospitalId) continue;
      await storage.updateServiceFolder(f.id, { sortOrder: f.sortOrder });
      updatedCount++;
    }
    res.json({ message: "Sort order updated", updatedCount });
  } catch (error) {
    logger.error("Error bulk-sorting service folders:", error);
    res.status(500).json({ message: "Failed to update sort order" });
  }
});

router.patch('/api/clinic/:hospitalId/service-folders/:folderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, folderId } = req.params;
    const folder = await storage.getServiceFolder(folderId);
    if (!folder || folder.hospitalId !== hospitalId) return res.status(404).json({ message: "Folder not found" });
    const updated = await storage.updateServiceFolder(folderId, { name: req.body.name });
    res.json(updated);
  } catch (error) {
    logger.error("Error updating service folder:", error);
    res.status(500).json({ message: "Failed to update service folder" });
  }
});

router.delete('/api/clinic/:hospitalId/service-folders/:folderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, folderId } = req.params;
    const folder = await storage.getServiceFolder(folderId);
    if (!folder || folder.hospitalId !== hospitalId) return res.status(404).json({ message: "Folder not found" });
    await storage.deleteServiceFolder(folderId);
    res.json({ message: "Folder deleted successfully" });
  } catch (error) {
    logger.error("Error deleting service folder:", error);
    res.status(500).json({ message: "Failed to delete service folder" });
  }
});
```

- [ ] **Step 4: Add the bulk-move-to-folder route**

Paste immediately after the block above:

```ts
router.post('/api/clinic/:hospitalId/services/bulk-move-to-folder', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { serviceIds, folderId } = req.body as { serviceIds: string[]; folderId: string | null };
    if (!Array.isArray(serviceIds)) return res.status(400).json({ message: "serviceIds array required" });

    if (folderId) {
      const folder = await storage.getServiceFolder(folderId);
      if (!folder || folder.hospitalId !== hospitalId) {
        return res.status(400).json({ message: "Invalid folderId for hospital" });
      }
    }

    const movedCount = await storage.bulkMoveServicesToFolder(hospitalId, serviceIds, folderId);
    res.json({ message: "Services moved", movedCount });
  } catch (error) {
    logger.error("Error bulk-moving services to folder:", error);
    res.status(500).json({ message: "Failed to move services" });
  }
});
```

- [ ] **Step 5: Extend the service update handler to accept `folderId`**

Run: `grep -n "PATCH.*/services/:serviceId\|/services/:id" server/routes/clinic.ts`

In the existing PATCH service handler, ensure the body destructuring / storage call passes `folderId` through. If the handler uses a broad `req.body` pass-through, no change is needed. If it whitelists fields, add `folderId` to the whitelist.

Verify with: `grep -n "folderId" server/routes/clinic.ts` — should show matches after editing.

- [ ] **Step 6: Run typecheck + quick sanity**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat(service-folders): routes + bulk-move-to-folder"
```

---

## Task 4: Backend integration tests

**Files:**
- Create: `tests/clinic-service-folders.test.ts`

- [ ] **Step 1: Inspect an existing test file to match the seed pattern**

Run: `head -80 tests/discharge-medication-templates.test.ts`

Note the helper(s) for seeding a hospital/unit/user + how `app` is imported. Adapt in the test below.

- [ ] **Step 2: Write failing test file**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../server/index"; // adjust to actual export; see sibling tests
import { db } from "../server/db";
import { serviceFolders, clinicServices, hospitals, units, users } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

// Minimal seed helpers — copy signatures from tests/discharge-medication-templates.test.ts if that pattern is used
async function seedHospital(): Promise<{ hospitalId: string; unitId: string; agent: request.SuperAgentTest }> {
  // Create hospital + unit + user, return an authenticated supertest agent
  // (The same helper pattern already used by tests/discharge-medication-templates.test.ts.)
  throw new Error("Copy the seed helper from a sibling test before running");
}

describe("clinic service folders", () => {
  let hospitalId: string;
  let unitId: string;
  let agent: request.SuperAgentTest;

  beforeEach(async () => {
    ({ hospitalId, unitId, agent } = await seedHospital());
  });

  it("creates and lists folders", async () => {
    const create = await agent
      .post(`/api/clinic/${hospitalId}/service-folders`)
      .send({ unitId, name: "Injectables" });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe("Injectables");

    const list = await agent.get(`/api/clinic/${hospitalId}/service-folders?unitId=${unitId}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it("renames a folder", async () => {
    const { body: f } = await agent
      .post(`/api/clinic/${hospitalId}/service-folders`)
      .send({ unitId, name: "Old" });
    const patch = await agent
      .patch(`/api/clinic/${hospitalId}/service-folders/${f.id}`)
      .send({ name: "New" });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe("New");
  });

  it("delete nulls child services' folderId (never deletes services)", async () => {
    const { body: folder } = await agent
      .post(`/api/clinic/${hospitalId}/service-folders`)
      .send({ unitId, name: "Temp" });

    const [svc] = await db.insert(clinicServices).values({
      hospitalId, unitId, name: "Botox touch-up", folderId: folder.id,
    }).returning();

    const del = await agent.delete(`/api/clinic/${hospitalId}/service-folders/${folder.id}`);
    expect(del.status).toBe(200);

    const [reloaded] = await db.select().from(clinicServices).where(eq(clinicServices.id, svc.id));
    expect(reloaded.folderId).toBeNull();
  });

  it("bulk-move-to-folder moves only the given services", async () => {
    const { body: folder } = await agent
      .post(`/api/clinic/${hospitalId}/service-folders`)
      .send({ unitId, name: "Laser" });
    const [a] = await db.insert(clinicServices).values({ hospitalId, unitId, name: "A" }).returning();
    const [b] = await db.insert(clinicServices).values({ hospitalId, unitId, name: "B" }).returning();
    const [c] = await db.insert(clinicServices).values({ hospitalId, unitId, name: "C" }).returning();

    const move = await agent
      .post(`/api/clinic/${hospitalId}/services/bulk-move-to-folder`)
      .send({ serviceIds: [a.id, b.id], folderId: folder.id });
    expect(move.status).toBe(200);
    expect(move.body.movedCount).toBe(2);

    const rows = await db.select().from(clinicServices).where(inArray(clinicServices.id, [a.id, b.id, c.id]));
    const byId = Object.fromEntries(rows.map(r => [r.id, r.folderId]));
    expect(byId[a.id]).toBe(folder.id);
    expect(byId[b.id]).toBe(folder.id);
    expect(byId[c.id]).toBeNull();
  });

  it("bulk-move-to-folder with folderId=null moves services to root", async () => {
    const { body: folder } = await agent
      .post(`/api/clinic/${hospitalId}/service-folders`)
      .send({ unitId, name: "Temp" });
    const [svc] = await db.insert(clinicServices).values({
      hospitalId, unitId, name: "X", folderId: folder.id,
    }).returning();

    const move = await agent
      .post(`/api/clinic/${hospitalId}/services/bulk-move-to-folder`)
      .send({ serviceIds: [svc.id], folderId: null });
    expect(move.status).toBe(200);

    const [reloaded] = await db.select().from(clinicServices).where(eq(clinicServices.id, svc.id));
    expect(reloaded.folderId).toBeNull();
  });

  it("rejects a folderId from a different hospital on bulk-move", async () => {
    const otherHospital = await seedHospital();
    const { body: foreignFolder } = await otherHospital.agent
      .post(`/api/clinic/${otherHospital.hospitalId}/service-folders`)
      .send({ unitId: otherHospital.unitId, name: "Foreign" });

    const [svc] = await db.insert(clinicServices).values({ hospitalId, unitId, name: "S" }).returning();
    const move = await agent
      .post(`/api/clinic/${hospitalId}/services/bulk-move-to-folder`)
      .send({ serviceIds: [svc.id], folderId: foreignFolder.id });
    expect(move.status).toBe(400);
  });
});
```

Before running, replace the `seedHospital()` stub with the actual helper used by the nearest sibling test (`tests/discharge-medication-templates.test.ts` or similar). Do not invent a new seed pattern.

- [ ] **Step 3: Run the tests — must fail first, then pass**

Run: `npx vitest run tests/clinic-service-folders.test.ts`
Expected: FAIL on first run (seed helper not wired), then PASS after wiring it to match the sibling test pattern.

- [ ] **Step 4: Commit**

```bash
git add tests/clinic-service-folders.test.ts
git commit -m "test(service-folders): integration tests for CRUD + bulk-move"
```

---

## Task 5: Shared folder types + adapter interface

**Files:**
- Create: `client/src/components/folders/types.ts`

- [ ] **Step 1: Write the types file**

```ts
export type Folder = {
  id: string;
  name: string;
  sortOrder: number;
};

export type FolderItem = {
  id: string;
  folderId: string | null;
  name: string;
};

export type FolderAdapter = {
  /** Stable query key identifying the folders query for react-query caching */
  foldersQueryKey: readonly unknown[];
  /** Stable query key identifying the items query (used to invalidate on moves) */
  itemsQueryKey: readonly unknown[];
  listFolders: () => Promise<Folder[]>;
  createFolder: (name: string) => Promise<Folder>;
  updateFolder: (id: string, patch: { name?: string; sortOrder?: number }) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;
  bulkSortFolders: (ordered: { id: string; sortOrder: number }[]) => Promise<void>;
  moveItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  bulkMoveItemsToFolder?: (itemIds: string[], folderId: string | null) => Promise<void>;
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/folders/types.ts
git commit -m "feat(folders): adapter types for shared folder component"
```

---

## Task 6: useFolderMutations hook

**Files:**
- Create: `client/src/components/folders/useFolderMutations.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FolderAdapter, Folder } from "./types";

export function useFolderMutations(adapter: FolderAdapter) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: adapter.foldersQueryKey });
    qc.invalidateQueries({ queryKey: adapter.itemsQueryKey });
  };

  const createFolder = useMutation({
    mutationFn: (name: string) => adapter.createFolder(name),
    onSuccess: invalidate,
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => adapter.updateFolder(id, { name }),
    onSuccess: invalidate,
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => adapter.deleteFolder(id),
    onSuccess: invalidate,
  });

  const bulkSortFolders = useMutation({
    mutationFn: (ordered: Folder[]) =>
      adapter.bulkSortFolders(ordered.map((f, i) => ({ id: f.id, sortOrder: i }))),
    onSuccess: () => qc.invalidateQueries({ queryKey: adapter.foldersQueryKey }),
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, folderId }: { itemId: string; folderId: string | null }) =>
      adapter.moveItemToFolder(itemId, folderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: adapter.itemsQueryKey }),
  });

  const bulkMoveItems = useMutation({
    mutationFn: ({ itemIds, folderId }: { itemIds: string[]; folderId: string | null }) => {
      if (!adapter.bulkMoveItemsToFolder) throw new Error("Adapter does not support bulk move");
      return adapter.bulkMoveItemsToFolder(itemIds, folderId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adapter.itemsQueryKey }),
  });

  return { createFolder, renameFolder, deleteFolder, bulkSortFolders, moveItem, bulkMoveItems };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/folders/useFolderMutations.ts
git commit -m "feat(folders): generic folder mutations hook"
```

---

## Task 7: FolderDialog + useFolderTreeState

**Files:**
- Create: `client/src/components/folders/useFolderTreeState.ts`
- Create: `client/src/components/folders/FolderDialog.tsx`

- [ ] **Step 1: Write `useFolderTreeState.ts`**

```ts
import { useState, useCallback } from "react";

export function useFolderTreeState(initial?: { selectedFolderId?: string | null }) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | "none">(
    initial?.selectedFolderId ?? null, // null = all; "none" = services without folder
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [dialogName, setDialogName] = useState("");

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditingFolderId(null);
    setDialogName("");
    setDialogOpen(true);
  }, []);

  const openRename = useCallback((id: string, currentName: string) => {
    setEditingFolderId(id);
    setDialogName(currentName);
    setDialogOpen(true);
  }, []);

  return {
    selectedFolderId,
    setSelectedFolderId,
    expanded,
    toggleExpanded,
    dialogOpen,
    setDialogOpen,
    editingFolderId,
    dialogName,
    setDialogName,
    openCreate,
    openRename,
  };
}
```

- [ ] **Step 2: Write `FolderDialog.tsx`**

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export function FolderDialog({ open, onOpenChange, mode, value, onChange, onSubmit, isSubmitting }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && value.trim()) onSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, value, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? t("folders.newFolder", "New folder")
              : t("folders.renameFolder", "Rename folder")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("folders.folderName", "Folder name")}</Label>
          <Input value={value} onChange={(e) => onChange(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={!value.trim() || isSubmitting}>
            {mode === "create" ? t("common.create", "Create") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/folders/useFolderTreeState.ts client/src/components/folders/FolderDialog.tsx
git commit -m "feat(folders): state hook + create/rename dialog"
```

---

## Task 8: FolderTree component (tree + drag-drop)

**Files:**
- Create: `client/src/components/folders/FolderTree.tsx`
- Create: `client/src/components/folders/index.ts`

- [ ] **Step 1: Write `FolderTree.tsx`**

```tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { ChevronRight, ChevronDown, Folder as FolderIcon, FolderPlus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Folder } from "./types";

interface Props {
  folders: Folder[];
  selectedFolderId: string | null | "none";
  onSelect: (id: string | null | "none") => void;
  onCreateClick: () => void;
  onRenameClick: (id: string, currentName: string) => void;
  onDeleteClick: (id: string) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  allLabel?: string;
  noneLabel?: string;
  disableDnd?: boolean;
}

function DroppableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("rounded transition-colors", isOver && "bg-primary/10 ring-2 ring-primary")}>
      {children}
    </div>
  );
}

function DraggableFolderHandle({ id, disabled }: { id: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `folder-${id}`, disabled });
  if (disabled) return null;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
      aria-label="Drag to reorder"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
  onCreateClick,
  onRenameClick,
  onDeleteClick,
  expanded,
  onToggleExpand,
  allLabel,
  noneLabel,
  disableDnd,
}: Props) {
  const { t } = useTranslation();
  const sorted = useMemo(() => [...folders].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [folders]);

  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-medium text-muted-foreground">{t("folders.title", "Folders")}</span>
        <Button size="sm" variant="ghost" onClick={onCreateClick} aria-label={t("folders.newFolder", "New folder")}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-2 py-1.5 rounded hover:bg-muted",
          selectedFolderId === null && "bg-muted font-medium",
        )}
      >
        {allLabel ?? t("folders.allItems", "All")}
      </button>

      <DroppableRow id="folder-none">
        <button
          onClick={() => onSelect("none")}
          className={cn(
            "w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2",
            selectedFolderId === "none" && "bg-muted font-medium",
          )}
        >
          <FolderIcon className="h-4 w-4 text-muted-foreground" />
          {noneLabel ?? t("folders.noFolder", "No folder")}
        </button>
      </DroppableRow>

      {sorted.map((folder) => {
        const isExpanded = expanded.has(folder.id);
        const isSelected = selectedFolderId === folder.id;
        return (
          <DroppableRow key={folder.id} id={`folder-${folder.id}`}>
            <div className={cn("flex items-center gap-1 px-1 py-1 rounded group hover:bg-muted", isSelected && "bg-muted")}>
              <DraggableFolderHandle id={folder.id} disabled={disableDnd} />
              <button
                type="button"
                onClick={() => onToggleExpand(folder.id)}
                className="p-0.5 text-muted-foreground"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => onSelect(folder.id)}
                className="flex-1 text-left flex items-center gap-2 min-w-0"
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </button>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => onRenameClick(folder.id, folder.name)}
                  aria-label={t("folders.renameFolder", "Rename folder")}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => onDeleteClick(folder.id)}
                  aria-label={t("folders.deleteFolder", "Delete folder")}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </DroppableRow>
        );
      })}
    </div>
  );
}
```

Note: the parent page owns the `DndContext` and the `onDragEnd` handler that interprets `folder-{id}` drop targets. This component only renders the droppable shells + draggable handles. Reasoning: both Items and Services want their own items-side drag sources (service rows vs item rows), so centralizing the `DndContext` in the consumer is cleaner than trying to also own it from inside FolderTree.

- [ ] **Step 2: Write `index.ts`**

```ts
export { FolderTree } from "./FolderTree";
export { FolderDialog } from "./FolderDialog";
export { useFolderMutations } from "./useFolderMutations";
export { useFolderTreeState } from "./useFolderTreeState";
export type { Folder, FolderItem, FolderAdapter } from "./types";
```

- [ ] **Step 3: Write minimal render test**

Create `tests/client/FolderTree.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import "@testing-library/jest-dom/vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "../../client/src/i18n/config";
import { FolderTree } from "../../client/src/components/folders/FolderTree";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <DndContext>{ui}</DndContext>
    </I18nextProvider>,
  );
}

describe("FolderTree", () => {
  const folders = [
    { id: "f1", name: "Injectables", sortOrder: 0 },
    { id: "f2", name: "Laser", sortOrder: 1 },
  ];

  it("renders folders in sort order", () => {
    renderWithProviders(
      <FolderTree
        folders={folders}
        selectedFolderId={null}
        onSelect={() => {}}
        onCreateClick={() => {}}
        onRenameClick={() => {}}
        onDeleteClick={() => {}}
        expanded={new Set()}
        onToggleExpand={() => {}}
      />,
    );
    const names = screen.getAllByText(/Injectables|Laser/).map((el) => el.textContent);
    expect(names).toEqual(["Injectables", "Laser"]);
  });

  it("calls onSelect when a folder is clicked", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <FolderTree
        folders={folders}
        selectedFolderId={null}
        onSelect={onSelect}
        onCreateClick={() => {}}
        onRenameClick={() => {}}
        onDeleteClick={() => {}}
        expanded={new Set()}
        onToggleExpand={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Injectables"));
    expect(onSelect).toHaveBeenCalledWith("f1");
  });

  it("calls onCreateClick when the add button is pressed", () => {
    const onCreateClick = vi.fn();
    renderWithProviders(
      <FolderTree
        folders={[]}
        selectedFolderId={null}
        onSelect={() => {}}
        onCreateClick={onCreateClick}
        onRenameClick={() => {}}
        onDeleteClick={() => {}}
        expanded={new Set()}
        onToggleExpand={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText(/new folder/i));
    expect(onCreateClick).toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/client/FolderTree.test.tsx`
Expected: 3 passing tests. If `@testing-library/react` is not installed, check `package.json`; `tests/client/postopTasksLogic.test.ts` already uses the test runner — if that sibling uses DOM testing utilities, reuse the same setup. If it does NOT (pure logic test), stop and ask before adding new test deps.

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/folders/ tests/client/FolderTree.test.tsx
git commit -m "feat(folders): reusable FolderTree component + render test"
```

---

## Task 9: i18n keys for folders + service bulk-move-to-folder

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add `folders` key group and new clinic.services.* keys in `en.json`**

Search `en.json` for `"clinic":` and find the `services` sub-object. Add inside it:

```json
"bulkMoveToFolder": "Move to folder",
"bulkMoveToFolderSuccess": "{{count}} service(s) moved",
"bulkMoveToFolderFailed": "Failed to move services to folder",
"folderFilterAll": "All services",
"folderFilterNone": "No folder",
```

At the top level of `en.json` (as a sibling of `treatments`, `admissionCongruence`, etc.), add:

```json
"folders": {
  "title": "Folders",
  "allItems": "All",
  "noFolder": "No folder",
  "newFolder": "New folder",
  "renameFolder": "Rename folder",
  "deleteFolder": "Delete folder",
  "deleteFolderConfirm": "Delete this folder? Contents will be moved to no folder.",
  "folderName": "Folder name",
  "emptyFolder": "No items in this folder.",
  "moveToFolder": "Move to folder",
  "moveToRoot": "Move to root"
},
```

- [ ] **Step 2: Add German translations in `de.json`**

Inside `clinic.services`:

```json
"bulkMoveToFolder": "In Ordner verschieben",
"bulkMoveToFolderSuccess": "{{count}} Dienstleistung(en) verschoben",
"bulkMoveToFolderFailed": "Verschieben in Ordner fehlgeschlagen",
"folderFilterAll": "Alle Dienstleistungen",
"folderFilterNone": "Kein Ordner",
```

Top-level:

```json
"folders": {
  "title": "Ordner",
  "allItems": "Alle",
  "noFolder": "Kein Ordner",
  "newFolder": "Neuer Ordner",
  "renameFolder": "Ordner umbenennen",
  "deleteFolder": "Ordner löschen",
  "deleteFolderConfirm": "Diesen Ordner löschen? Inhalte werden nach „Kein Ordner“ verschoben.",
  "folderName": "Ordnername",
  "emptyFolder": "Keine Einträge in diesem Ordner.",
  "moveToFolder": "In Ordner verschieben",
  "moveToRoot": "In Stammordner verschieben"
},
```

- [ ] **Step 3: Validate JSON + typecheck**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('client/src/i18n/locales/en.json','utf8'));JSON.parse(require('fs').readFileSync('client/src/i18n/locales/de.json','utf8'));console.log('OK')"
```
Expected: prints `OK`.

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "i18n(folders): EN/DE keys for folder tree + services bulk-move-to-folder"
```

---

## Task 10: Migrate Items page to shared FolderTree

**Files:**
- Modify: `client/src/pages/Items.tsx`
- Modify (likely): `client/src/pages/items/useItemsState.ts`, `useItemsMutations.ts`, `useItemsQueries.ts`
- Possibly delete: `client/src/pages/items/DragDropComponents.tsx` (only if entirely replaced)

> This is the riskiest task. The goal is **behavior parity** — no user-visible change on `/inventory/items`, just a code swap under the hood. Do one step at a time, smoke-test after each.

- [ ] **Step 1: Create an items folder adapter in `client/src/pages/items/itemsFolderAdapter.ts`**

```ts
import type { FolderAdapter, Folder } from "@/components/folders";
import { apiRequest } from "@/lib/queryClient";

export function buildItemsFolderAdapter(hospitalId: string, unitId: string): FolderAdapter {
  const foldersQueryKey = ["folders", hospitalId, unitId] as const;
  const itemsQueryKey = [`/api/items/${hospitalId}`, unitId] as const;
  return {
    foldersQueryKey,
    itemsQueryKey,
    listFolders: async () => {
      const res = await apiRequest("GET", `/api/folders/${hospitalId}?unitId=${unitId}`);
      return (await res.json()) as Folder[];
    },
    createFolder: async (name) => {
      const res = await apiRequest("POST", `/api/folders`, { hospitalId, unitId, name });
      return res.json();
    },
    updateFolder: async (id, patch) => {
      const res = await apiRequest("PATCH", `/api/folders/${id}`, patch);
      return res.json();
    },
    deleteFolder: async (id) => { await apiRequest("DELETE", `/api/folders/${id}`); },
    bulkSortFolders: async (ordered) => {
      await apiRequest("PATCH", `/api/folders/bulk-sort`, { folders: ordered });
    },
    moveItemToFolder: async (itemId, folderId) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { folderId });
    },
  };
}
```

- [ ] **Step 2: Replace Items.tsx folder rendering with `<FolderTree>`**

In `client/src/pages/Items.tsx`:

1. Remove the inline folder-tree JSX (the block that renders the folder list with expand/collapse/rename/delete icons — currently tangled with drag-drop detection).
2. Keep the outer `DndContext` and `onDragEnd` handler (still needed for item row drags).
3. Inside the `DndContext`, render:

```tsx
import { FolderTree, FolderDialog, useFolderTreeState, useFolderMutations } from "@/components/folders";
import { buildItemsFolderAdapter } from "./items/itemsFolderAdapter";

// inside component
const adapter = useMemo(() => buildItemsFolderAdapter(hospitalId!, unitId!), [hospitalId, unitId]);
const tree = useFolderTreeState();
const folderMut = useFolderMutations(adapter);

// JSX
<FolderTree
  folders={folders}
  selectedFolderId={tree.selectedFolderId}
  onSelect={tree.setSelectedFolderId}
  onCreateClick={tree.openCreate}
  onRenameClick={tree.openRename}
  onDeleteClick={(id) => {
    if (window.confirm(t("folders.deleteFolderConfirm"))) folderMut.deleteFolder.mutate(id);
  }}
  expanded={tree.expanded}
  onToggleExpand={tree.toggleExpanded}
  allLabel={t("items.allItems", "All items")}
/>
<FolderDialog
  open={tree.dialogOpen}
  onOpenChange={tree.setDialogOpen}
  mode={tree.editingFolderId ? "rename" : "create"}
  value={tree.dialogName}
  onChange={tree.setDialogName}
  isSubmitting={folderMut.createFolder.isPending || folderMut.renameFolder.isPending}
  onSubmit={() => {
    if (tree.editingFolderId) {
      folderMut.renameFolder.mutate({ id: tree.editingFolderId, name: tree.dialogName }, {
        onSuccess: () => tree.setDialogOpen(false),
      });
    } else {
      folderMut.createFolder.mutate(tree.dialogName, { onSuccess: () => tree.setDialogOpen(false) });
    }
  }}
/>
```

4. Keep the existing `onDragEnd` for items — but delegate folder reordering (`folder-*` → `folder-*`) to:
```ts
if (activeId.startsWith("folder-") && overId.startsWith("folder-")) {
  const activeFolderId = activeId.replace("folder-", "");
  const overFolderId = overId.replace("folder-", "");
  const arr = [...folders];
  const from = arr.findIndex(f => f.id === activeFolderId);
  const to = arr.findIndex(f => f.id === overFolderId);
  if (from === -1 || to === -1) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  folderMut.bulkSortFolders.mutate(arr);
  return;
}
```

5. Delegate item-dropped-on-folder to:
```ts
if (overId.startsWith("folder-")) {
  const targetFolderId = overId === "folder-none" ? null : overId.replace("folder-", "");
  folderMut.moveItem.mutate({ itemId: activeId, folderId: targetFolderId });
  return;
}
```

6. Remove `createFolderMutation, updateFolderMutation, deleteFolderMutation, updateFoldersSortMutation, moveItemMutation` from `useItemsMutations.ts` and the corresponding setter props. Remove `folderDialogOpen/editingFolder/folderName` state from `useItemsState.ts`.

- [ ] **Step 3: Smoke test Items page manually**

Run: `npm run dev`

Open `/inventory/items`. Verify:
1. Folder list renders (same layout as before).
2. "New folder" creates a folder.
3. Rename works.
4. Delete works and does not lose items.
5. Drag a folder to reorder — persists after refresh.
6. Drag an item onto a folder — item moves.
7. Drag an item onto "No folder" — item's folderId clears.

If any of the six fails, stop and diagnose before proceeding.

- [ ] **Step 4: Run typecheck + existing tests**

Run:
```bash
npm run check
npx vitest run tests/
```
Expected: typecheck clean, no test regressions.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Items.tsx client/src/pages/items/
git commit -m "refactor(items): use shared FolderTree component (behavior parity)"
```

---

## Task 11: Services page — sidebar + folder filtering

**Files:**
- Create: `client/src/pages/clinic/servicesFolderAdapter.ts`
- Modify: `client/src/pages/clinic/Services.tsx`

- [ ] **Step 1: Write the adapter**

```ts
import type { FolderAdapter, Folder } from "@/components/folders";
import { apiRequest } from "@/lib/queryClient";

export function buildServicesFolderAdapter(hospitalId: string, unitId: string): FolderAdapter {
  const foldersQueryKey = ["service-folders", hospitalId, unitId] as const;
  const itemsQueryKey = [`/api/clinic/${hospitalId}/services`, unitId] as const;
  return {
    foldersQueryKey,
    itemsQueryKey,
    listFolders: async () => {
      const res = await apiRequest("GET", `/api/clinic/${hospitalId}/service-folders?unitId=${unitId}`);
      return (await res.json()) as Folder[];
    },
    createFolder: async (name) => {
      const res = await apiRequest("POST", `/api/clinic/${hospitalId}/service-folders`, { unitId, name });
      return res.json();
    },
    updateFolder: async (id, patch) => {
      const res = await apiRequest("PATCH", `/api/clinic/${hospitalId}/service-folders/${id}`, patch);
      return res.json();
    },
    deleteFolder: async (id) => {
      await apiRequest("DELETE", `/api/clinic/${hospitalId}/service-folders/${id}`);
    },
    bulkSortFolders: async (ordered) => {
      await apiRequest("PATCH", `/api/clinic/${hospitalId}/service-folders/bulk-sort`, { folders: ordered });
    },
    moveItemToFolder: async (serviceId, folderId) => {
      await apiRequest("PATCH", `/api/clinic/${hospitalId}/services/${serviceId}`, { folderId });
    },
    bulkMoveItemsToFolder: async (serviceIds, folderId) => {
      await apiRequest("POST", `/api/clinic/${hospitalId}/services/bulk-move-to-folder`, { serviceIds, folderId });
    },
  };
}
```

- [ ] **Step 2: Wire the sidebar into `Services.tsx`**

At the top, add imports:

```tsx
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { FolderTree, FolderDialog, useFolderTreeState, useFolderMutations } from "@/components/folders";
import { buildServicesFolderAdapter } from "./servicesFolderAdapter";
```

Inside the component, before the existing return:

```tsx
const folderAdapter = useMemo(() => buildServicesFolderAdapter(hospitalId!, unitId!), [hospitalId, unitId]);
const folderTree = useFolderTreeState();
const folderMut = useFolderMutations(folderAdapter);

const { data: folders = [] } = useQuery({
  queryKey: folderAdapter.foldersQueryKey,
  queryFn: folderAdapter.listFolders,
  enabled: !!hospitalId && !!unitId,
});

const filteredServices = useMemo(() => {
  if (folderTree.selectedFolderId === null) return services;
  if (folderTree.selectedFolderId === "none") return services.filter((s) => !s.folderId);
  return services.filter((s) => s.folderId === folderTree.selectedFolderId);
}, [services, folderTree.selectedFolderId]);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return;
  const activeId = String(active.id);
  const overId = String(over.id);

  if (activeId.startsWith("folder-") && overId.startsWith("folder-")) {
    const from = folders.findIndex((f) => f.id === activeId.replace("folder-", ""));
    const to = folders.findIndex((f) => f.id === overId.replace("folder-", ""));
    if (from === -1 || to === -1) return;
    const arr = [...folders];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    folderMut.bulkSortFolders.mutate(arr);
    return;
  }

  if (overId.startsWith("folder-")) {
    const target = overId === "folder-none" ? null : overId.replace("folder-", "");
    folderMut.moveItem.mutate({ itemId: activeId, folderId: target });
  }
};
```

Wrap the page in a `DndContext onDragEnd={handleDragEnd}` and render a two-column layout: sidebar (`<FolderTree>`) + existing services list (now using `filteredServices` instead of `services`).

Add the `<FolderDialog>` (copy the block from Task 10 Step 2, point it at `folderMut` from here).

Render service rows as `DraggableItem` using the existing pattern from Items (or inline: `useDraggable({ id: service.id })`).

- [ ] **Step 3: Smoke test**

Run: `npm run dev`

Open `/inventory/services`. Verify:
1. Sidebar renders with "All services" + "No folder" + any existing folders.
2. Create a folder → appears in sidebar.
3. Drag a single service onto a folder → service moves (after refresh the filter shows it in that folder).
4. Click a folder → list filters to services in that folder.
5. Rename / delete folder work.
6. Delete folder → services in it move to "No folder" (no services disappear).
7. Existing bulk actions (move to unit, set billable, import, update-group) still work end-to-end.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/clinic/Services.tsx client/src/pages/clinic/servicesFolderAdapter.ts
git commit -m "feat(services): folder sidebar + drag-drop + filtering"
```

---

## Task 12: Services "Move to folder" bulk action

**Files:**
- Modify: `client/src/pages/clinic/Services.tsx`

- [ ] **Step 1: Add bulk-move-to-folder state + mutation**

Inside the component, alongside existing bulk state:

```tsx
const [bulkFolderDialogOpen, setBulkFolderDialogOpen] = useState(false);
const [bulkFolderTargetId, setBulkFolderTargetId] = useState<string | "none">("none");

const bulkMoveToFolderMutation = useMutation({
  mutationFn: async () => {
    const folderId = bulkFolderTargetId === "none" ? null : bulkFolderTargetId;
    const res = await apiRequest(
      "POST",
      `/api/clinic/${hospitalId}/services/bulk-move-to-folder`,
      { serviceIds: Array.from(selectedServiceIds), folderId },
    );
    return res.json();
  },
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: folderAdapter.itemsQueryKey });
    queryClient.invalidateQueries({ queryKey: folderAdapter.foldersQueryKey });
    setIsBulkMode(false);
    setSelectedServiceIds(new Set());
    setBulkFolderDialogOpen(false);
    toast({
      title: t("clinic.services.bulkMoveToFolderSuccess", `${data.movedCount || 0} service(s) moved`, {
        count: data.movedCount || 0,
      }),
    });
  },
  onError: (err: any) => {
    toast({
      variant: "destructive",
      title: t("clinic.services.bulkMoveToFolderFailed", "Failed to move services to folder"),
      description: err.message,
    });
  },
});
```

- [ ] **Step 2: Add a "Move to folder" button in the bulk-action bar**

Next to the existing "Move to unit" button, add:

```tsx
<Button variant="outline" size="sm" onClick={() => setBulkFolderDialogOpen(true)}>
  {t("clinic.services.bulkMoveToFolder", "Move to folder")}
</Button>
```

Render a small picker dialog:

```tsx
<Dialog open={bulkFolderDialogOpen} onOpenChange={setBulkFolderDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t("clinic.services.bulkMoveToFolder", "Move to folder")}</DialogTitle>
    </DialogHeader>
    <div className="space-y-2">
      <Label>{t("folders.moveToFolder", "Move to folder")}</Label>
      <Select value={bulkFolderTargetId} onValueChange={(v) => setBulkFolderTargetId(v as string | "none")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("folders.moveToRoot", "Move to root")}</SelectItem>
          {folders.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setBulkFolderDialogOpen(false)}>
        {t("common.cancel", "Cancel")}
      </Button>
      <Button disabled={bulkMoveToFolderMutation.isPending} onClick={() => bulkMoveToFolderMutation.mutate()}>
        {t("common.move", "Move")}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`

1. Enter bulk mode, select 2-3 services.
2. Click "Move to folder", pick a folder, confirm.
3. Verify toast shows correct count.
4. Verify services appear in the chosen folder after the list refreshes.
5. Repeat with "Move to root" — services' folder filter chip should clear.
6. Verify all OTHER bulk actions (move to unit, set billable, update group, import) still work unchanged.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/clinic/Services.tsx
git commit -m "feat(services): bulk-move-to-folder action"
```

---

## Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `npm run check`
Expected: exits 0.

- [ ] **Step 2: Run all vitest tests**

Run: `npx vitest run`
Expected: all green (or at least: no new failures compared to `main` baseline).

- [ ] **Step 3: Check deploy readiness ("check db for deploy")**

Per `CLAUDE.md` workflow:
1. Open `migrations/0224_service_folders.sql` — confirm every statement uses `IF NOT EXISTS` / `DO $$ … END $$`.
2. Run: `npx drizzle-kit push`. Expected: "No changes detected" or "Changes applied" with no pending diffs.
3. Run: `npm run check`. Expected: exits 0.
4. Verify the new migration's `when` timestamp in `migrations/meta/_journal.json` is the highest.

- [ ] **Step 4: Visual smoke pass**

Open `/inventory/items` and `/inventory/services` side-by-side in the running dev server. Confirm:
- Same sidebar layout and icons.
- German UI has no English leaks for new strings (switch the language toggle if available).
- Existing items page behavior is unchanged (folder CRUD, drag reorder, item-to-folder drop).

- [ ] **Step 5: Commit any fixes and push**

If any fixes were needed during verification, commit them with descriptive messages. Then:

```bash
git status            # confirm clean
git log --oneline -15 # review the commit chain
```

Do NOT push until the user explicitly asks.
