# Service Folders — Design

**Date:** 2026-04-17
**Status:** Draft
**Owner:** @drmauij

## Goal

Bring the same flat-folder organization that `/inventory/items` already offers to `/inventory/services`, so clinics with large service catalogs can group services (e.g. "Injectables", "Laser", "Consultations") in a sidebar tree and drag services between folders.

Out of scope: nested folders, cross-unit sharing, per-folder permissions, renaming the existing `serviceGroups` tag concept (tags stay, they coexist with folders).

## Context

`/inventory/items` already has a working folders mechanism:

- **Schema:** `folders` table keyed on `hospital_id + unit_id`, flat (no `parent_id`), with `sort_order`. `items.folder_id` is a nullable FK (`shared/schema.ts:277`, `shared/schema.ts:295`).
- **Routes:** `GET/POST/PATCH/DELETE /api/folders/*` + `PATCH /api/folders/bulk-sort` (`server/routes/inventory.ts`).
- **Storage:** `getFolders / getFolder / createFolder / updateFolder / deleteFolder` in `server/storage/inventory.ts`. Delete nullifies children's `folder_id` in a transaction.
- **UI:** `client/src/pages/Items.tsx` (~5,280 lines) hosts the folder tree, `DroppableFolder`, drag-drop via `@dnd-kit` with `closestCorners`, plus folder CRUD dialogs. Logic lives in `client/src/pages/items/useItemsState.ts`, `useItemsMutations.ts`, `useItemsQueries.ts`.

Services (`client/src/pages/clinic/Services.tsx`, ~1,109 lines) currently:

- Renders a flat list of `clinic_services` (scoped by `hospital_id + unit_id`, `shared/schema.ts:3940`).
- Has a multi-select tag concept (`serviceGroups` jsonb array, different from folders).
- Has existing bulk actions: `bulk-move` (to another unit), `bulk-set-billable`, `bulk-import`, `bulk-update-group` (tags). A new `bulk-move-to-folder` must slot in next to these without disrupting them.

## Approach

### 1. DB — new `service_folders` table (parallel to `folders`)

A dedicated table rather than a shared `folders` table with a `module` discriminator:

- Items folders are live in production; adding a discriminator forces touching every existing query and creates cross-module accident risk.
- The two domains are already separate in routes, storage, and UI — shared physical storage adds coupling without simplification.
- A parallel table keeps the change additive and keeps the blast radius on items at zero.

```sql
CREATE TABLE IF NOT EXISTS service_folders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id varchar NOT NULL REFERENCES hospitals(id),
  unit_id varchar NOT NULL REFERENCES units(id),
  name varchar NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_folders_hospital ON service_folders (hospital_id);
CREATE INDEX IF NOT EXISTS idx_service_folders_unit ON service_folders (unit_id);

ALTER TABLE clinic_services
  ADD COLUMN IF NOT EXISTS folder_id varchar REFERENCES service_folders(id);
CREATE INDEX IF NOT EXISTS idx_clinic_services_folder ON clinic_services (folder_id);
```

Drizzle schema additions in `shared/schema.ts`:

- Export `serviceFolders` table.
- Add `folderId` column to `clinicServices`.

Migration is fully idempotent (`IF NOT EXISTS` everywhere). Generated via `npm run db:generate` then manually made idempotent per the project's migration rule.

### 2. Backend — mirror the inventory folder routes under a services-specific namespace

Add the routes to the existing `server/routes/clinic.ts` file (matches the convention — all other clinic-scoped routes live there, including the existing services bulk actions). Same for storage.

Routes:

- `GET    /api/clinic/:hospitalId/service-folders?unitId=…` — list, ordered by `sort_order, name`.
- `POST   /api/clinic/:hospitalId/service-folders` — body `{ unitId, name }`; `sortOrder` defaults to current max + 1.
- `PATCH  /api/clinic/:hospitalId/service-folders/bulk-sort` — body `{ folderIds: string[] }`, rewrites `sort_order` in one transaction.
- `PATCH  /api/clinic/:hospitalId/service-folders/:folderId` — body `{ name }`.
- `DELETE /api/clinic/:hospitalId/service-folders/:folderId` — transaction: `UPDATE clinic_services SET folder_id=NULL WHERE folder_id=:id; DELETE FROM service_folders WHERE id=:id`.
- `POST   /api/clinic/:hospitalId/services/bulk-move-to-folder` — body `{ serviceIds: string[], folderId: string | null }` (null = move to root). Returns `{ movedCount }`. Matches the response shape of existing bulk-move / bulk-update-group.

The existing service update handler is extended to accept `folderId` so drag-one-service-to-folder works via the normal PATCH.

All routes enforce hospital access, same as current clinic services routes.

### 3. Storage — new functions in `server/storage/clinic.ts`

Mirror the inventory API:

- `getServiceFolders(hospitalId, unitId)` — ordered list.
- `getServiceFolder(id)` — single.
- `createServiceFolder(folder)` — insert + return.
- `updateServiceFolder(id, updates)` — patch + touch `updated_at`.
- `deleteServiceFolder(id)` — transaction: null-out `clinic_services.folder_id`, then delete the folder row.
- `bulkMoveServicesToFolder(hospitalId, serviceIds, folderId)` — single `UPDATE … WHERE id = ANY(…) AND hospital_id = …` returning affected rows.

`getClinicServices` returns `folderId` (already pulling all columns — just expose it on the response type).

### 4. Frontend — extract a reusable folder tree, then reuse on services

The items page's folder tree is tangled into a 5,280-line file, so step one is extraction. This is the targeted improvement the existing code needs to absorb a second consumer cleanly.

**New shared primitives in `client/src/components/folders/`:**

- `<FolderTree>` — renders a sortable, droppable sidebar tree from a `folders: Folder[]` + `items: FolderItem[]` input. Props: `selectedFolderId`, `onSelectFolder`, `onCreateFolder`, `onRenameFolder`, `onDeleteFolder`, `onReorderFolders`, `onMoveItemToFolder`, `isLoading`. Internally uses `@dnd-kit` with `closestCorners`, same as items today.
- `<FolderDialog>` — create/rename dialog (shared modal).
- `useFolderTreeState(options)` — expanded/selected state + ephemeral UI state.
- `useFolderMutations(adapter)` — generic create/update/delete/bulk-sort/move mutations. `adapter` supplies the API paths + query keys so one hook serves both items and services.

Types live in `client/src/components/folders/types.ts`:

```ts
export type Folder = { id: string; name: string; sortOrder: number };
export type FolderItem = { id: string; folderId: string | null; name: string };
export type FolderAdapter = {
  listKey: readonly unknown[];
  listFolders: () => Promise<Folder[]>;
  createFolder: (name: string) => Promise<Folder>;
  updateFolder: (id: string, patch: { name?: string }) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;
  bulkSortFolders: (orderedIds: string[]) => Promise<void>;
  moveItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  bulkMoveItemsToFolder?: (itemIds: string[], folderId: string | null) => Promise<void>;
};
```

**Migrate the items page** to consume the new primitives. The page shrinks; behavior is preserved. This step is scoped — it is NOT a general refactor of Items.tsx, only the folder-tree extraction.

**Services page (`client/src/pages/clinic/Services.tsx`):**

- Add a sidebar column hosting `<FolderTree>` + "New folder" button (same layout as items).
- "All services" and "No folder" pseudo-entries at the top of the tree (mirror items).
- Filter the service list by `selectedFolderId` (null = all; "none" sentinel = services without a folder).
- Extend the bulk-action bar: add **"Move to folder"** → opens a folder-picker → calls the new `bulk-move-to-folder` endpoint. Leaves existing bulk actions (move-to-unit, set-billable, import, update-group) untouched and visible.
- Drag-and-drop a single service onto a folder moves it via the existing service PATCH with `{ folderId }`.

### 5. i18n

New key groups in both `client/src/i18n/locales/en.json` and `de.json`:

- `folders.*` — shared keys for the `<FolderTree>` component: `allItems`, `noFolder`, `newFolder`, `renameFolder`, `deleteFolder`, `deleteFolderConfirm`, `folderName`, `emptyFolder`, `moveToFolder`, `moveToRoot`.
- `clinic.services.bulkMoveToFolder` + `bulkMoveToFolderSuccess` / `bulkMoveToFolderFailed` toast strings.

German translations shipped in the same commit.

### 6. Tests

Integration tests in `server/__tests__/clinic-service-folders.test.ts` covering:

- CRUD on `service_folders` (list/create/rename/delete/bulk-sort).
- Delete reparents children to `folder_id = NULL` (no services deleted).
- `bulk-move-to-folder` moves only the specified services within the specified hospital.
- Auth: cross-hospital access is rejected.

Frontend: minimal Vitest coverage for the new `<FolderTree>` component (renders folders, calls `onSelectFolder`, emits drag-and-drop events) — matches the depth of existing frontend tests in the repo (light).

## Data Flow

```
  Services page                  API                       DB
  ─────────────                  ───                       ──
  list folders    →  GET  /service-folders  →  SELECT service_folders ORDER BY sort_order
  list services   →  GET  /services         →  SELECT clinic_services (includes folder_id)
  create folder   →  POST /service-folders  →  INSERT service_folders
  rename          →  PATCH …                →  UPDATE service_folders
  delete          →  DELETE …               →  TXN: UPDATE clinic_services SET folder_id=NULL; DELETE service_folders
  reorder         →  PATCH bulk-sort        →  TXN: UPDATE sort_order for each id
  drag-1-service  →  PATCH /services/:id    →  UPDATE clinic_services SET folder_id=…
  bulk move       →  POST bulk-move-to-folder → UPDATE clinic_services SET folder_id=… WHERE id=ANY(…)
```

## Error Handling

- Invalid `folderId` on service PATCH: 400 if folder belongs to a different hospital.
- Delete of a non-existent folder: 404.
- Bulk move with a service outside the hospital: that service is silently skipped (matches existing `bulk-move` / `bulk-update-group` behavior); `movedCount` reflects actual updates.
- Drag-drop optimistic updates with `queryClient.setQueryData`, roll back on mutation error (same pattern as items).

## Rollout

1. Ship DB migration (idempotent).
2. Ship backend routes + storage + tests.
3. Ship frontend primitives + items page migration (behavior-preserving).
4. Ship services page integration + i18n.
5. Manual smoke test on a seeded clinic.

All in one feature branch, one PR, merged to `main`.

## Risks & Mitigations

- **Items page regression during extraction.** Mitigation: extract with behavior parity tests (manual smoke + existing items tests), land the extraction before any Services.tsx wiring.
- **Bulk action UI crowding.** The services bulk bar already has five actions. Mitigation: "Move to folder" lives in the same action group as "Move to unit"; consider grouping into a single "Move…" dropdown if the UX gets noisy (decide during implementation based on screen measurements).
- **Services with `folder_id` pointing at a deleted folder** would be an FK violation — prevented by the transactional delete that nulls children first.

## Success Criteria

- `/inventory/services` has a folder sidebar visually and behaviorally matching `/inventory/items`.
- All existing services bulk actions keep working unchanged.
- A new "Move to folder" bulk action works end-to-end.
- German UI has no English leaks for new strings.
- Items page still passes its existing tests and visual smoke checks.
- Deleting a folder never loses a service row.
