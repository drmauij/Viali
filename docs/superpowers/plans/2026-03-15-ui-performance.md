# UI Performance Optimization Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve UI responsiveness across the app by fixing React performance anti-patterns — component memoization, conditional dialog rendering, query optimization, and breaking up monolithic components.

**Architecture:** Surgical refactoring — no behavior changes, no new features. Each task extracts or wraps existing code. TypeScript check (`npm run check`) is the primary verification after each task.

**Tech Stack:** React, React Query (TanStack), TypeScript, Shadcn UI

---

## Chunk 1: Surgical Fixes (Low Risk, High ROI)

### Task 1: Optimize React Query staleTime in useOpData

**Files:**
- Modify: `client/src/hooks/useOpData.tsx`

Currently 10+ queries use `staleTime: 0` with `refetchOnMount: "always"`, causing refetches on every component mount. Surgical data doesn't change fast enough to warrant this.

- [ ] **Step 1: Update staleTime for stable operational queries**

Change these queries from `staleTime: 0` to `staleTime: 30_000` (30 seconds):
- Anesthesia Record (line ~32-39)
- Anesthesia Items (line ~83-88)
- Staff Members (line ~97-102)
- Positions (line ~104-109)
- Inventory Usage (line ~119-124)
- Inventory Commits (line ~126-131)

Keep `staleTime: 0` for rapidly-changing data:
- Vitals Data — updated every few seconds by monitors
- Medications Data — updated during active surgery
- Events Data — updated frequently
- Clinical Snapshot — aggregated real-time data

Also remove `refetchOnMount: "always"` from the queries being changed to 30s staleTime — that flag defeats the purpose.

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useOpData.tsx
git commit -m "perf: increase staleTime for stable queries in useOpData"
```

---

### Task 2: Conditional Dialog Rendering in UnifiedTimeline

**Files:**
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

Currently 25+ dialog components are always mounted even when `open={false}`. Wrap each dialog in a conditional so it only mounts when open.

- [ ] **Step 1: Wrap all dialog components in conditionals**

For each dialog in the JSX return (lines ~5033-7006), change pattern from:
```tsx
<SomeDialog open={isOpen} onOpenChange={setIsOpen} ... />
```
to:
```tsx
{isOpen && <SomeDialog open={isOpen} onOpenChange={setIsOpen} ... />}
```

Apply to all dialogs:
- MedicationDoseDialog, MedicationEditDialog, MedicationConfigDialog, OnDemandMedicationDialog
- EventDialog, HeartRhythmDialog, BISDialog, TOFDialog, VASDialog, ScoresDialog, PositionDialog
- VentilationDialog, VentilationEditDialog, VentilationModeEditDialog, VentilationModeAddDialog, VentilationBulkDialog
- OutputDialog, OutputEditDialog, OutputBulkDialog
- InfusionDialog, InfusionEditDialog, FreeFlowDoseDialog, FreeFlowManageDialog
- RateSelectionDialog, RateManageDialog
- ManualVitalsDialog, BulkVitalsDialog

**Important:** The `open` prop name varies — check each dialog. Some use `open`, some might use `isOpen` or similar. Use the state variable that controls visibility as the conditional guard.

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "perf: conditionally render dialogs in UnifiedTimeline"
```

---

### Task 3: Conditional Dialog Rendering in Op.tsx

**Files:**
- Modify: `client/src/pages/anesthesia/Op.tsx`

Same pattern as Task 2 — wrap dialogs in conditionals.

- [ ] **Step 1: Wrap dialog components in conditionals**

Apply to all dialogs at the bottom of Op.tsx (lines ~4706-4861+):
- Allergies/CAVE dialog
- Add Sterile Item dialog
- WHO Checklist Signature Pads
- Weight dialog
- Duplicates dialog
- Camera dialog
- Sets dialogs

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/anesthesia/Op.tsx
git commit -m "perf: conditionally render dialogs in Op.tsx"
```

---

### Task 4: React.memo on List Item Components

**Files:**
- Modify: `client/src/pages/anesthesia/Pacu.tsx` — PacuPatientCard and PacuVitalsCard
- Modify: `client/src/components/anesthesia/PacuVitalsCard.tsx` — if separate component file

- [ ] **Step 1: Identify list item components rendered in .map() loops**

Check these files for components rendered inside `.map()`:
- `Pacu.tsx` — PacuPatientCard (lines ~51-210), PacuVitalsCard
- `UnassociatedQuestionnaires.tsx` — renderResponseCard function

- [ ] **Step 2: Wrap PacuPatientCard with React.memo**

If PacuPatientCard is defined inline in Pacu.tsx, extract it to a named component and wrap:
```tsx
const PacuPatientCard = React.memo(function PacuPatientCard({ ... }: Props) {
  // existing implementation
});
```

- [ ] **Step 3: Wrap PacuVitalsCard with React.memo**

Same pattern — wrap with React.memo if it's a separate component file.

- [ ] **Step 4: Convert renderResponseCard to a memoized component in UnassociatedQuestionnaires**

Convert the inline `renderResponseCard` function to a proper `ResponseCard` component wrapped in `React.memo`.

- [ ] **Step 5: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/anesthesia/Pacu.tsx client/src/components/anesthesia/PacuVitalsCard.tsx client/src/pages/clinic/UnassociatedQuestionnaires.tsx
git commit -m "perf: add React.memo to list item components"
```

---

## Chunk 2: Break Up Op.tsx (4,875 lines → ~2,000 lines)

### Task 5: Extract PostOpTab from Op.tsx

**Files:**
- Create: `client/src/pages/anesthesia/op/PostOpTab.tsx`
- Modify: `client/src/pages/anesthesia/Op.tsx`

Extract the Post-Op tab content (lines ~2064-2542, ~480 lines) into its own component.

- [ ] **Step 1: Create PostOpTab component**

Extract the Post-Op card JSX. The component needs these props:
- `postOpData` + `setPostOpData` (or a combined handler)
- `anesthesiaRecordId` (for auto-save)
- `canWrite` (permission flag)
- `t` (i18n function)

Move the postOpData state, auto-save mutation, and all PONV/ambulatory care logic into the new component (co-locate state with UI).

- [ ] **Step 2: Replace inline JSX in Op.tsx with `<PostOpTab />`**

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/anesthesia/op/PostOpTab.tsx client/src/pages/anesthesia/Op.tsx
git commit -m "refactor: extract PostOpTab from Op.tsx"
```

---

### Task 6: Extract IntraOpTab from Op.tsx

**Files:**
- Create: `client/src/pages/anesthesia/op/IntraOpTab.tsx`
- Modify: `client/src/pages/anesthesia/Op.tsx`

Extract the Intra-Op tab content (lines ~2549-4314, ~1,765 lines) — the largest tab with 13 collapsible sections.

- [ ] **Step 1: Create IntraOpTab component**

Move all intraOpData state, the debounced auto-save mutation, expandedIntraOpSections state, hasIntraOpData helper, and all 13 section JSX blocks into the new component.

Props needed:
- `surgeryId`
- `anesthesiaRecordId`
- `canWrite`
- `t` (i18n)
- `surgery` (for disinfection staff lookup)

- [ ] **Step 2: Replace inline JSX in Op.tsx with `<IntraOpTab />`**

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/anesthesia/op/IntraOpTab.tsx client/src/pages/anesthesia/Op.tsx
git commit -m "refactor: extract IntraOpTab from Op.tsx"
```

---

### Task 7: Extract CountsSterileTab from Op.tsx

**Files:**
- Create: `client/src/pages/anesthesia/op/CountsSterileTab.tsx`
- Modify: `client/src/pages/anesthesia/Op.tsx`

Extract the Counts & Sterile tab content (lines ~4317-4699, ~382 lines).

- [ ] **Step 1: Create CountsSterileTab component**

Move countsSterileData state, auto-save mutation, sterile items state, sticker documentation state and handlers, and all JSX into the new component.

Props needed:
- `surgeryId`
- `anesthesiaRecordId`
- `canWrite`
- `t` (i18n)

- [ ] **Step 2: Replace inline JSX in Op.tsx with `<CountsSterileTab />`**

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/anesthesia/op/CountsSterileTab.tsx client/src/pages/anesthesia/Op.tsx
git commit -m "refactor: extract CountsSterileTab from Op.tsx"
```

---

### Task 8: Extract AllergiesDialog from Op.tsx

**Files:**
- Create: `client/src/pages/anesthesia/op/AllergiesDialog.tsx`
- Modify: `client/src/pages/anesthesia/Op.tsx`

Extract the Allergies & CAVE dialog (lines ~4707-4783) plus its state (selectedAllergies, tempAllergies, handlers).

- [ ] **Step 1: Create AllergiesDialog component**

Move allergies dialog state and JSX. Props:
- `patientId`
- `preOpAssessmentId`
- `open` / `onOpenChange`
- `currentAllergies` / `currentCave` (initial values from patient)
- `onSave` callback
- `anesthesiaSettings` (for allergy options list)

- [ ] **Step 2: Replace in Op.tsx**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/pages/anesthesia/op/AllergiesDialog.tsx client/src/pages/anesthesia/Op.tsx
git commit -m "refactor: extract AllergiesDialog from Op.tsx"
```

---

## Chunk 3: Break Up UnifiedTimeline.tsx (7,114 lines → ~3,500 lines)

### Task 9: Extract chart configuration to useTimelineChartOptions hook

**Files:**
- Create: `client/src/components/anesthesia/unifiedTimeline/useTimelineChartOptions.ts`
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

The `option` useMemo (lines ~2681-3578, ~900 lines) builds the entire ECharts configuration. Extract it to a custom hook.

- [ ] **Step 1: Create useTimelineChartOptions hook**

Extract the massive `option` useMemo into a hook that takes the necessary inputs (data, theme, viewport bounds, swimlane config, etc.) and returns the ECharts option object.

- [ ] **Step 2: Replace inline useMemo in UnifiedTimeline with hook call**

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/anesthesia/unifiedTimeline/useTimelineChartOptions.ts client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "refactor: extract chart options to useTimelineChartOptions hook"
```

---

### Task 10: Extract data syncing effects to useTimelineDataSync hook

**Files:**
- Create: `client/src/components/anesthesia/unifiedTimeline/useTimelineDataSync.ts`
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

The data syncing effects (lines ~799-1182, ~380 lines) sync React Query data into local state. Extract to a custom hook.

- [ ] **Step 1: Create useTimelineDataSync hook**

Move all the useEffect blocks that sync clinical snapshot data into local state (vitals, medications, ventilation modes, ventilation params, output, positions, events, heart rhythm, BIS, TOF, VAS, scores).

The hook takes the clinical snapshot + medication data as input and calls the various state setters.

- [ ] **Step 2: Replace effects in UnifiedTimeline with hook call**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/components/anesthesia/unifiedTimeline/useTimelineDataSync.ts client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "refactor: extract data sync effects to useTimelineDataSync hook"
```

---

### Task 11: Extract mutations to useTimelineMutations hook

**Files:**
- Create: `client/src/components/anesthesia/unifiedTimeline/useTimelineMutations.ts`
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

Mutations (lines ~286-473, ~190 lines) plus vital point CRUD handlers can be extracted.

- [ ] **Step 1: Create useTimelineMutations hook**

Move all useMutation calls (saveMedication, saveTimeMarkers, lockRecord, unlockRecord, createVentilationMode, createEvent, createMedication, reorderMeds, createOutput, and all update/delete mutations).

- [ ] **Step 2: Replace in UnifiedTimeline with hook call**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/components/anesthesia/unifiedTimeline/useTimelineMutations.ts client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "refactor: extract mutations to useTimelineMutations hook"
```

---

### Task 12: Extract MedicationItemsSidebar from UnifiedTimeline

**Files:**
- Create: `client/src/components/anesthesia/unifiedTimeline/MedicationItemsSidebar.tsx`
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

The medication items sidebar (y-axis labels with admin group folders, lines ~3775-4250, ~475 lines) is a self-contained UI block.

- [ ] **Step 1: Create MedicationItemsSidebar component**

Extract the sidebar JSX that renders admin group folders with collapsible items. Wrap in React.memo.

Props needed:
- `itemsByAdminGroup` (grouped items)
- `collapsedSwimlanes` / `toggleSwimlane`
- `canWrite`
- Dialog openers (onConfigClick, onDoseClick, etc.)

- [ ] **Step 2: Replace in UnifiedTimeline**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/components/anesthesia/unifiedTimeline/MedicationItemsSidebar.tsx client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "refactor: extract MedicationItemsSidebar from UnifiedTimeline"
```

---

### Task 13: Extract MedicationReorderPanel from UnifiedTimeline

**Files:**
- Create: `client/src/components/anesthesia/unifiedTimeline/MedicationReorderPanel.tsx`
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

The medication reorder mode (lines ~4338-4600, ~260 lines) with DnD folder-based reordering.

- [ ] **Step 1: Create MedicationReorderPanel component**

Extract reorder mode state (isReorderMode, reorderedItemsByFolder, collapsedFolders), DnD sensors, enter/cancel/save handlers, and DnD JSX. Wrap in React.memo.

- [ ] **Step 2: Replace in UnifiedTimeline**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/components/anesthesia/unifiedTimeline/MedicationReorderPanel.tsx client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "refactor: extract MedicationReorderPanel from UnifiedTimeline"
```

---

## Chunk 4: Break Up Items.tsx (6,129 lines → ~3,000 lines)

### Task 14: Extract AddItemDialog from Items.tsx

**Files:**
- Create: `client/src/pages/items/AddItemDialog.tsx`
- Modify: `client/src/pages/Items.tsx`

The Add Item dialog (lines ~2888-4900+, ~2,000 lines) is the largest dialog with multi-step flow, camera capture, Galexis lookup, and code scanning.

- [ ] **Step 1: Create AddItemDialog component**

Move all add-item-specific state (formData, step, image upload, codes, Galexis lookup), handlers (handleAddItem, handleImageUpload, handleWebcamCapture, lookupGalexisProduct, handleCodesImageUpload), and dialog JSX.

Props needed:
- `open` / `onOpenChange`
- `unitId`
- `onItemCreated` callback (for cache invalidation)

- [ ] **Step 2: Replace in Items.tsx**

Remove all add-item state and handlers from Items.tsx. Replace dialog JSX with `<AddItemDialog />`.

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/items/AddItemDialog.tsx client/src/pages/Items.tsx
git commit -m "refactor: extract AddItemDialog from Items.tsx"
```

---

### Task 15: Extract TransferItemsDialog from Items.tsx

**Files:**
- Create: `client/src/pages/items/TransferItemsDialog.tsx`
- Modify: `client/src/pages/Items.tsx`

Transfer Items dialog (lines ~5597-5971, ~374 lines) with direction selection, unit picker, item search, quantity adjustment.

- [ ] **Step 1: Create TransferItemsDialog component**

Move transfer state (transferItems, transferTargetUnitId, transferDirection) and JSX.

- [ ] **Step 2: Replace in Items.tsx**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/pages/items/TransferItemsDialog.tsx client/src/pages/Items.tsx
git commit -m "refactor: extract TransferItemsDialog from Items.tsx"
```

---

### Task 16: Extract ItemRow component from Items.tsx

**Files:**
- Create: `client/src/pages/items/ItemRow.tsx`
- Modify: `client/src/pages/Items.tsx`

The item row rendering logic (lines ~2293-2838) has 3 modes (normal, bulk-edit, bulk-delete) and is repeated for folder items and root items.

- [ ] **Step 1: Create ItemRow component with React.memo**

Extract the item rendering into a memoized component that handles all 3 display modes.

Props needed:
- `item` data
- `mode` ('normal' | 'bulk-edit' | 'bulk-delete')
- Event handlers (onEdit, onQuickOrder, onQuickReduce, onToggleSelect, etc.)

- [ ] **Step 2: Replace both instances of item row rendering in Items.tsx**

- [ ] **Step 3: Run TypeScript check & commit**

```bash
git add client/src/pages/items/ItemRow.tsx client/src/pages/Items.tsx
git commit -m "refactor: extract memoized ItemRow from Items.tsx"
```

---

## Chunk 5: Final Optimizations

### Task 17: useCallback for handlers passed to list children

**Files:**
- Modify: `client/src/pages/anesthesia/Pacu.tsx`
- Modify: `client/src/pages/clinic/UnassociatedQuestionnaires.tsx`
- Modify: `client/src/pages/Items.tsx`

- [ ] **Step 1: Wrap event handlers with useCallback in Pacu.tsx**

Wrap handlers passed to PacuPatientCard/PacuVitalsCard in `.map()` loops with `useCallback`.

- [ ] **Step 2: Wrap event handlers with useCallback in UnassociatedQuestionnaires.tsx**

Wrap handleOpenAssociateDialog, handleQuickAssociate, handleAssociate with `useCallback`.

- [ ] **Step 3: Wrap event handlers with useCallback in Items.tsx**

Wrap toggleItemSelection, handleQuickOrder, handleQuickReduce, and other handlers passed to ItemRow with `useCallback`.

- [ ] **Step 4: Run TypeScript check**

Run: `npm run check`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/anesthesia/Pacu.tsx client/src/pages/clinic/UnassociatedQuestionnaires.tsx client/src/pages/Items.tsx
git commit -m "perf: add useCallback to handlers passed to memoized list items"
```

---

## Task Dependency Graph

```
Chunk 1 (Tasks 1-4): Independent, can run in parallel
  Task 1: useOpData staleTime
  Task 2: UnifiedTimeline conditional dialogs
  Task 3: Op.tsx conditional dialogs
  Task 4: React.memo on list items

Chunk 2 (Tasks 5-8): Sequential (each modifies Op.tsx)
  Task 5: PostOpTab → Task 6: IntraOpTab → Task 7: CountsSterileTab → Task 8: AllergiesDialog

Chunk 3 (Tasks 9-13): Sequential (each modifies UnifiedTimeline.tsx)
  Task 9: useTimelineChartOptions → Task 10: useTimelineDataSync → Task 11: useTimelineMutations → Task 12: MedicationItemsSidebar → Task 13: MedicationReorderPanel

Chunk 4 (Tasks 14-16): Sequential (each modifies Items.tsx)
  Task 14: AddItemDialog → Task 15: TransferItemsDialog → Task 16: ItemRow

Chunk 5 (Task 17): Depends on Tasks 4, 16 (React.memo + ItemRow must exist first)
  Task 17: useCallback wrappers

Chunks 1-4 can run in parallel. Chunk 5 runs last.
```
