# Postop Orders — Inline Editor Redesign (2026-05-07)

## Problem

The current postop orders UX is split across two surfaces:

- **`OrdersGlanceCard`** — a read-only summary on the patient's anesthesia page (rendered at `Op.tsx:1490` and `Op.tsx:2342`).
- **`OrderSetEditorDialog`** — a full-screen modal opened by the card's "Edit" button. Inside the modal, items are organized into **4 tabs** (`medication`, `monitoring & labs`, `care & tasks`, `notes`). The header has a single "Add Item" dropdown listing all 12 item types and a template picker.

Two problems:

1. **Tabs hide context.** Reviewing all postop orders requires clicking through 4 tabs. There is no "everything at a glance" editing view.
2. **Too many item types.** 12 distinct types (`medication`, `iv_fluid`, `bz_sliding_scale`, `vitals_monitoring`, `lab`, `mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `task`, `free_text`) each with their own editor file. Six of those (`mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `free_text`) are essentially "things the nurse should do" with shallow structured fields — they collapse cleanly into one `task` type with a `subtype` label.

## Goal

Replace `OrderSetEditorDialog` (modal) with a reusable inline component `PostopOrdersEditor` mounted directly where `OrdersGlanceCard` currently sits. The new editor shows all four sub-cards simultaneously in a 2×2 grid: **Medications**, **Monitoring**, **Labs**, **Tasks**.

Collapse 6 item types into the `task` type with a `subtype` discriminator.

## Architecture

### Component structure

- **New** `client/src/components/anesthesia/postop/PostopOrdersEditor.tsx` — the reusable component. Contains:
  - Top bar: title (left), template picker (right)
  - 2×2 grid: Medications · Monitoring · Labs · Tasks sub-cards
  - Footer: AI paste trigger (collapsed by default, expand on click), "Save as template" button
  - Read-only mode (`canEdit={false}`): hides + buttons, click-to-edit, AI paste, save-as-template; rows render as compact non-interactive summaries
- **Delete** `client/src/components/anesthesia/postop/OrderSetEditorDialog.tsx`
- **Refactor** `client/src/components/anesthesia/postop/OrdersGlanceCard.tsx` → becomes a thin wrapper (or is deleted if `PostopOrdersEditor` covers both modes). **Decision: delete `OrdersGlanceCard`**; `PostopOrdersEditor` handles both edit and read-only via `canEdit` prop. All summary logic moves into `PostopOrdersEditor`.

### Sub-card pattern

Each sub-card is a self-contained block:

```
┌─ Medications  [count]              + Add ─┐
│ Novalgin 1g IV          q8h               │
│ Paracetamol 1g IV       PRN max 4/day    │
│ Ringer-Laktat 1000ml    12h infusion      │
└────────────────────────────────────────────┘
```

- **Header:** icon + title + count pill on the left, single "+" button on the right.
- **Item rows:** compact summary by default (name + brief schedule meta).
- **Click row → expand inline editor** (the existing per-type editor renders below the row's title; row width pushes from compact to full editor body). Click again or click another row → collapse.
- **+ button behavior:** depends on the card.

| Card | + button creates | Sub-types accessible |
|---|---|---|
| Medications | `medication` (default) via the existing dropdown — **unchanged** | `medication`, `iv_fluid`, `bz_sliding_scale` (existing dropdown stays) |
| Monitoring | `vitals_monitoring` directly (one click, no menu) | only `vitals_monitoring` |
| Labs | `lab` directly | only `lab` |
| Tasks | `task` directly with `subtype: 'generic'` | one type — `task`, with subtype dropdown inside the editor |

## Data model changes

### Removed item types

Delete from `shared/postopOrderItems.ts`:

- `MobilizationItem`
- `PositioningItem`
- `DrainItem`
- `NutritionItem`
- `WoundCareItem`
- `FreeTextItem`

Remove from the `PostopOrderItem` union, `PostopOrderItemType`, `SCHEDULABLE_ITEM_TYPES` (only `wound_care` was schedulable), `ALLOWED_MODES_BY_TYPE`, and `createEmptyItem`.

### TaskItem reshape

```ts
export type TaskSubtype =
  | 'generic'
  | 'positioning'
  | 'drainage'
  | 'nutrition'
  | 'wound_care'
  | 'mobilization'
  | 'note';

export interface TaskItem {
  id: ItemId;
  type: 'task';
  subtype: TaskSubtype;          // NEW — required
  title: string;
  timing: Timing;                 // unchanged
  actionHint?: string;            // unchanged
  note?: string;                  // NEW — optional clinical note
}
```

`createEmptyItem('task', id)` returns `{ id, type: 'task', subtype: 'generic', title: '', timing: { mode: 'one_shot' } }`.

The structured fields from the deleted types (`Mobilization.value`, `Positioning.value` + `customText`, `Drain.drainType` + `site`, `Nutrition.value` + `startAfter`, `WoundCare.check`) are **not preserved**. Anything the user previously stored in those enums must be expressed as free text in `task.title` (or `task.note`). E.g. a Position with `value: 'head_up_30'` becomes `Task { subtype: 'positioning', title: 'Head up 30°' }`. A Drain with `drainType: 'redon'` + `site: 'left axilla'` becomes `Task { subtype: 'drainage', title: 'Redon left axilla' }`.

### Migration

No production data exists. Drop all dev rows in the same step as the editor merge:

```sql
DELETE FROM anesthesia_postop_orders;
```

Same playbook as the unified-timing migration (2026-05-07).

## UX details

### Layout

2×2 grid responsive to container width:

- ≥1280px (typical): 2 columns × 2 rows
- 768–1280px: 2 columns × 2 rows (cards narrow)
- <768px (rare for clinicians): 1 column × 4 rows (stacked)

### Editing

**Click any item row** → that row expands inline showing the existing item editor (e.g. `MedicationEditor`, `VitalsMonitoringEditor`, etc.). Other rows in the same sub-card collapse. The editor's existing remove (X) button remains visible.

**Auto-save semantics.** No Save / Cancel / Confirm buttons. Every change to an item (typing in a field, picking a subtype, changing timing) triggers an `onChange(items)` call to the parent. The parent owns persistence (debounced PUT to `/api/anesthesia/records/:recordId/postop-orders`). Same backend route as today.

**Why no Cancel/undo:** the existing modal has Cancel + Save buttons because the modal is a transactional surface. Inline editing is not — every micro-edit is its own commit. Loss of "discard all my changes" is a real cost; it's accepted because (a) per-item editing is much cheaper to undo manually than a 12-item batch, (b) the dialog's transactional model rarely matched real use (users typed slowly, reviewed as they went), and (c) the "Save as template" button still snapshots the current state.

### Template picker

Top-right corner of the editor wrap. Identical select control as the current dialog. Picking a template resets `items` to a deep clone of `template.items` and sets `templateId`. Auto-saves immediately.

### AI paste

Currently always-visible in the dialog header. Demote to a collapsed trigger at the bottom of the editor:

```
─────────────────────
▶ AI paste orders…
─────────────────────
```

Click → expands the existing `AiPasteOrders` block (textarea + parse + preview). Same component, just collapsible wrapper.

### Read-only mode (`canEdit=false`)

- All "+ Add" buttons hidden
- Item rows non-clickable (no expand)
- Compact summary text in each row (use the same formatters as today's `OrdersGlanceCard`)
- AI paste trigger hidden
- "Save as template" button hidden
- Template picker still visible but disabled

## Out of scope

- **Drag-to-reorder items.** Order within a sub-card stays insertion-order (newest-first, like today).
- **Filtering / search.** Each sub-card stays a flat list.
- **AI parser SYSTEM_PROMPT update for new TaskItem shape.** Pre-existing pending work; will be addressed in a follow-up commit.
- **Outputs migration** (`anesthesiaRecordPdf.ts`, `dischargeBriefData.ts`) — already pending, separate work.

## Files affected

**Created:**
- `client/src/components/anesthesia/postop/PostopOrdersEditor.tsx`

**Deleted:**
- `client/src/components/anesthesia/postop/OrderSetEditorDialog.tsx`
- `client/src/components/anesthesia/postop/OrdersGlanceCard.tsx`
- `client/src/components/anesthesia/postop/itemEditors/MobilizationEditor.tsx`
- `client/src/components/anesthesia/postop/itemEditors/PositioningEditor.tsx`
- `client/src/components/anesthesia/postop/itemEditors/DrainEditor.tsx`
- `client/src/components/anesthesia/postop/itemEditors/NutritionEditor.tsx`
- `client/src/components/anesthesia/postop/itemEditors/WoundCareEditor.tsx`
- `client/src/components/anesthesia/postop/itemEditors/FreeTextEditor.tsx`

**Modified:**
- `shared/postopOrderItems.ts` — remove 6 item types, add `subtype` to `TaskItem`, update unions / `createEmptyItem` / `ALLOWED_MODES_BY_TYPE` / `SCHEDULABLE_ITEM_TYPES`
- `shared/postopOrderPlanning.ts` — remove `wound_care` mapping from `KIND_BY_TYPE` (it routed to `task`); confirm planner still works for `task` (already does)
- `client/src/components/anesthesia/postop/itemEditors/index.tsx` — remove the 6 deleted editor exports, remove `ItemCategory` / `ITEM_CATEGORY` / `CATEGORY_ORDER` / `useCategoryLabels` (the 4-tab grouping is replaced by the 4 sub-cards which the new editor owns directly)
- `client/src/components/anesthesia/postop/itemEditors/TaskEditor.tsx` — add `subtype` dropdown at top, optional `note` textarea
- `client/src/components/anesthesia/postop/AiPasteOrders.tsx` — preview formatter loses references to deleted types
- `client/src/components/anesthesia/postop/postopTasksLogic.ts` — already uses `task`; verify no references to deleted types
- `client/src/pages/anesthesia/Op.tsx` — both call sites: replace `<OrdersGlanceCard ... onEdit={openDialog} />` + `<OrderSetEditorDialog ... />` pair with `<PostopOrdersEditor ... onChange={debouncedSave} />`. Drop the `editDialogOpen` state.
- `server/services/postopOrderAIParser.ts` — SYSTEM_PROMPT loses 6 type definitions, gains `subtype` field on task. *(Note: the parser SYSTEM_PROMPT was already flagged as incomplete pre-existing work — this becomes its de-facto fix-up.)*
- `server/seed/postopOrderTemplates.ts` — convert any seeded `mobilization` / `positioning` / `drain` / `nutrition` / `wound_care` / `free_text` items to `task` with appropriate subtype + title
- `tests/shared/postopOrderItems.timing.test.ts` — remove `wound_care` default test, the 4 non-schedulable tests (mobilization/positioning/drain/nutrition were tested as having no `timing` field — now they don't exist; replace with one test that confirms `task` defaults are correct)
- `tests/shared/postopOrderItems.test.ts` — update for new union shape
- `tests/shared/postopOrderPlanning.test.ts` — update any test cases that used `wound_care` / `task` with old fields

## Self-review

- **Placeholder scan:** none.
- **Internal consistency:** `subtype: 'note'` covers what `FreeTextItem` did. `subtype: 'wound_care'` carries the dressing-change schedule via `timing` (same model as today). Read-only summary logic moves from `OrdersGlanceCard` into `PostopOrdersEditor` — verified no other callers.
- **Scope:** focused on UI consolidation + 6-type collapse + dialog removal. AI parser SYSTEM_PROMPT rewrite stays in scope (tightly coupled to data-model change). Outputs migration explicitly excluded.
- **Ambiguity:** auto-save debounce target (200ms? 500ms?) — defer to plan; default to 300ms to match similar surfaces in the app, confirmable during implementation.
