# Postop Orders — Inline Editor + Task Subtype Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal `OrderSetEditorDialog` and read-only `OrdersGlanceCard` with a single reusable inline `PostopOrdersEditor` component that shows all four sub-cards (Medications, Monitoring, Labs, Tasks) at once. Collapse 6 item types (`mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `free_text`) into the existing `task` type with a new `subtype` discriminator.

**Architecture:** New `PostopOrdersEditor.tsx` is mounted directly in `Op.tsx` where `OrdersGlanceCard` currently sits (2 call sites). It owns no item state — the parent passes `items` + `templateId` and listens for `onChange`. The parent debounces persistence via the existing `handleSaveOrderSet` route (no server change). The 4 sub-cards are rendered in a 2×2 grid; each item row toggles between compact summary and inline editor on click. Auto-save replaces the modal's Save/Cancel buttons.

**Tech Stack:** TypeScript + React + Vitest. shadcn UI primitives (Card, Select, Dialog→removed, Tabs→removed, Tooltip). Existing `<TimingField>` reused unchanged for schedulable items. Existing `useItemTypeLabels` / per-type editor components reused.

**Spec:** `docs/superpowers/specs/2026-05-07-postop-orders-inline-editor-design.md`

---

## File Structure

**Created:**
- `client/src/components/anesthesia/postop/PostopOrdersEditor.tsx` — the new inline editor (replaces both `OrdersGlanceCard` and `OrderSetEditorDialog`). Read + edit modes via `canEdit` prop.

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
- `shared/postopOrderItems.ts` — remove 6 item types, add `subtype` + `note` to `TaskItem`, update unions/maps/`createEmptyItem`
- `shared/postopOrderPlanning.ts` — drop `wound_care` from `KIND_BY_TYPE`
- `client/src/components/anesthesia/postop/itemEditors/index.tsx` — remove deleted exports, drop `ItemCategory` / `ITEM_CATEGORY` / `CATEGORY_ORDER` / `useCategoryLabels`
- `client/src/components/anesthesia/postop/itemEditors/TaskEditor.tsx` — add subtype dropdown + optional note textarea
- `client/src/components/anesthesia/postop/AiPasteOrders.tsx` — preview formatter loses references to deleted types
- `client/src/components/anesthesia/postop/postopTasksLogic.ts` — verify all `item.type === 'wound_care'` references removed (renamed to task subtype if any)
- `client/src/pages/anesthesia/Op.tsx` — both call sites: replace `<OrdersGlanceCard ... onEdit={...}/>` + `<OrderSetEditorDialog ... />` pair with `<PostopOrdersEditor ... onChange={debouncedSave} />`. Drop `orderEditorOpen` state.
- `server/services/postopOrderAIParser.ts` — SYSTEM_PROMPT loses 6 type definitions, gains task `subtype` field
- `server/seed/postopOrderTemplates.ts` — convert 4 seeded items (`mobilization`, `positioning`, `nutrition`, `wound_care`) into `task` with appropriate subtype
- `tests/shared/postopOrderItems.timing.test.ts` — drop tests for non-existent types, add task-subtype default
- `tests/shared/postopOrderItems.test.ts` — update for new union shape
- `tests/shared/postopOrderPlanning.test.ts` — verify task-with-subtype still plans correctly

**One-shot dev DB cleanup:** `DELETE FROM anesthesia_postop_orders;` — run in Task 8 (operator).

---

## Task 1: Add `subtype` + `note` to TaskItem and remove 6 deleted item types

**Files:**
- Modify: `shared/postopOrderItems.ts`
- Test: `tests/shared/postopOrderItems.timing.test.ts`

- [ ] **Step 1: Update the timing-defaults test to match the new shape**

Replace `tests/shared/postopOrderItems.timing.test.ts` entirely with:

```ts
import { describe, it, expect } from 'vitest';
import { createEmptyItem } from '@shared/postopOrderItems';

describe('createEmptyItem — defaults after subtype collapse', () => {
  it('medication defaults to scheduled mode', () => {
    const item = createEmptyItem('medication', 'm1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled' });
  });
  it('iv_fluid defaults to one_shot mode', () => {
    const item = createEmptyItem('iv_fluid', 'i1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
  });
  it('lab defaults to one_shot mode', () => {
    const item = createEmptyItem('lab', 'l1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
  });
  it('task defaults to one_shot mode + generic subtype + empty title', () => {
    const item = createEmptyItem('task', 't1') as any;
    expect(item.timing).toEqual({ mode: 'one_shot' });
    expect(item.subtype).toBe('generic');
    expect(item.title).toBe('');
  });
  it('vitals_monitoring defaults to scheduled q1h', () => {
    const item = createEmptyItem('vitals_monitoring', 'v1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled', frequency: 'q1h' });
  });
  it('bz_sliding_scale defaults to scheduled q4h', () => {
    const item = createEmptyItem('bz_sliding_scale', 'b1') as any;
    expect(item.timing).toEqual({ mode: 'scheduled', frequency: 'q4h' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/postopOrderItems.timing.test.ts`
Expected: FAIL — current `createEmptyItem('task', ...)` does not return a `subtype` field.

- [ ] **Step 3: Reshape `shared/postopOrderItems.ts`**

Apply these changes to the file:

1. Delete the interfaces: `MobilizationItem`, `PositioningItem`, `DrainItem`, `NutritionItem`, `WoundCareItem`, `FreeTextItem`.

2. Replace the existing `TaskItem` interface with:

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
  subtype: TaskSubtype;
  title: string;
  timing: Timing;
  actionHint?: string;
  note?: string;
}
```

3. Replace the `PostopOrderItem` union with:

```ts
export type PostopOrderItem =
  | VitalsMonitoringItem
  | MedicationItem
  | IvFluidItem
  | LabItem
  | TaskItem
  | BzSlidingScaleItem;
```

4. Replace `SCHEDULABLE_ITEM_TYPES`:

```ts
export const SCHEDULABLE_ITEM_TYPES: ReadonlySet<PostopOrderItemType> = new Set([
  'medication', 'iv_fluid', 'lab', 'task',
  'vitals_monitoring', 'bz_sliding_scale',
]);
```

5. Replace `ALLOWED_MODES_BY_TYPE`:

```ts
export const ALLOWED_MODES_BY_TYPE: Record<PostopOrderItemType, TimingMode[]> = {
  medication:        ['scheduled', 'one_shot', 'ad_hoc', 'conditional'],
  iv_fluid:          ['scheduled', 'one_shot'],
  lab:               ['scheduled', 'one_shot'],
  task:              ['scheduled', 'one_shot', 'ad_hoc', 'conditional'],
  vitals_monitoring: ['scheduled'],
  bz_sliding_scale:  ['scheduled'],
};
```

6. Replace `createEmptyItem`:

```ts
export function createEmptyItem(type: PostopOrderItemType, id: ItemId): PostopOrderItem {
  switch (type) {
    case 'vitals_monitoring':
      return { id, type, parameter: 'BP', timing: { mode: 'scheduled', frequency: 'q1h' } };
    case 'medication':
      return { id, type, medicationRef: '', dose: '', route: 'po', timing: { mode: 'scheduled' } };
    case 'iv_fluid':
      return { id, type, solution: 'ringer_lactate', volumeMl: 1000, durationH: 12, timing: { mode: 'one_shot' } };
    case 'lab':
      return { id, type, panel: [], timing: { mode: 'one_shot' } };
    case 'task':
      return { id, type, subtype: 'generic', title: '', timing: { mode: 'one_shot' } };
    case 'bz_sliding_scale':
      return { id, type, drug: 'Actrapid', rules: [{ above: 120, units: 2 }], timing: { mode: 'scheduled', frequency: 'q4h' } };
  }
}
```

- [ ] **Step 4: Run timing-defaults test to verify it passes**

Run: `npx vitest run tests/shared/postopOrderItems.timing.test.ts`
Expected: PASS — 6 specs.

- [ ] **Step 5: Update the smaller `postopOrderItems.test.ts`**

Read `tests/shared/postopOrderItems.test.ts`. It has 2 tests. Remove any reference to deleted types (`mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `free_text`). If a test uses one of those types, replace it with `task` of an appropriate subtype, or delete the test if it specifically tested a deleted type's shape.

Run: `npx vitest run tests/shared/postopOrderItems.test.ts`
Expected: PASS.

- [ ] **Step 6: Run typecheck to surface every legacy-type consumer**

Run: `npm run check`
Expected: many errors across `OrdersGlanceCard.tsx`, `OrderSetEditorDialog.tsx`, `itemEditors/index.tsx`, `AiPasteOrders.tsx`, `postopTasksLogic.ts`, `Op.tsx`, the 6 deleted editor files, the AI parser, the seed file. **Do not fix them in this task.** Subsequent tasks address each.

- [ ] **Step 7: Commit**

```bash
git add shared/postopOrderItems.ts tests/shared/postopOrderItems.timing.test.ts tests/shared/postopOrderItems.test.ts
git commit -m "feat(postop): collapse 6 item types into task with subtype + note"
```

---

## Task 2: Update the planner

**Files:**
- Modify: `shared/postopOrderPlanning.ts`
- Modify: `tests/shared/postopOrderPlanning.test.ts`

- [ ] **Step 1: Drop deleted types from `KIND_BY_TYPE`**

In `shared/postopOrderPlanning.ts`, locate `KIND_BY_TYPE`. Replace with:

```ts
const KIND_BY_TYPE: Record<string, PlannedEventKind> = {
  medication: 'medication',
  iv_fluid: 'iv_fluid',
  vitals_monitoring: 'vitals_check',
  bz_sliding_scale: 'vitals_check',
  lab: 'task',
  task: 'task',
};
```

(`wound_care` removed — it no longer exists as an item type. The `task` mapping remains and now serves all former `wound_care` items via `task` with `subtype: 'wound_care'`.)

- [ ] **Step 2: Update planner tests**

Read `tests/shared/postopOrderPlanning.test.ts`. Find any test that uses `wound_care` / `positioning` / `drain` / `nutrition` / `mobilization` / `free_text` types. The current planner test uses `task` and `wound_care`, etc. — replace any `wound_care` test with a `task` of `subtype: 'wound_care'` instead, e.g.:

```ts
{ id: 'w1', type: 'task', subtype: 'wound_care', title: 'Verbandwechsel', timing: { mode: 'scheduled', frequency: 'q24h' } },
```

If the existing tests do not reference `wound_care`, no test changes needed.

- [ ] **Step 3: Run planner tests**

Run: `npx vitest run tests/shared/postopOrderPlanning.test.ts tests/shared/postopTiming.test.ts`
Expected: PASS — both green.

- [ ] **Step 4: Commit**

```bash
git add shared/postopOrderPlanning.ts tests/shared/postopOrderPlanning.test.ts
git commit -m "feat(postop): drop wound_care from planner KIND_BY_TYPE (now task subtype)"
```

---

## Task 3: Delete 6 editor files; update itemEditors/index.tsx; refresh TaskEditor

**Files:**
- Delete: `client/src/components/anesthesia/postop/itemEditors/MobilizationEditor.tsx`
- Delete: `client/src/components/anesthesia/postop/itemEditors/PositioningEditor.tsx`
- Delete: `client/src/components/anesthesia/postop/itemEditors/DrainEditor.tsx`
- Delete: `client/src/components/anesthesia/postop/itemEditors/NutritionEditor.tsx`
- Delete: `client/src/components/anesthesia/postop/itemEditors/WoundCareEditor.tsx`
- Delete: `client/src/components/anesthesia/postop/itemEditors/FreeTextEditor.tsx`
- Modify: `client/src/components/anesthesia/postop/itemEditors/index.tsx`
- Modify: `client/src/components/anesthesia/postop/itemEditors/TaskEditor.tsx`
- Modify: `client/src/i18n/locales/en/translation.json`
- Modify: `client/src/i18n/locales/de/translation.json`

- [ ] **Step 1: Delete the 6 editor files**

```bash
rm client/src/components/anesthesia/postop/itemEditors/MobilizationEditor.tsx \
   client/src/components/anesthesia/postop/itemEditors/PositioningEditor.tsx \
   client/src/components/anesthesia/postop/itemEditors/DrainEditor.tsx \
   client/src/components/anesthesia/postop/itemEditors/NutritionEditor.tsx \
   client/src/components/anesthesia/postop/itemEditors/WoundCareEditor.tsx \
   client/src/components/anesthesia/postop/itemEditors/FreeTextEditor.tsx
```

- [ ] **Step 2: Replace `client/src/components/anesthesia/postop/itemEditors/index.tsx`**

Replace the file's contents with:

```tsx
import { useTranslation } from 'react-i18next';
import type { PostopOrderItem, PostopOrderItemType } from '@shared/postopOrderItems';
import { VitalsMonitoringEditor } from './VitalsMonitoringEditor';
import { MedicationEditor } from './MedicationEditor';
import { IvFluidEditor } from './IvFluidEditor';
import { LabEditor } from './LabEditor';
import { TaskEditor } from './TaskEditor';
import { BzSlidingScaleEditor } from './BzSlidingScaleEditor';

export interface ItemEditorProps<T extends PostopOrderItem = PostopOrderItem> {
  item: T;
  onChange: (item: T) => void;
  onRemove: () => void;
  hospitalId?: string;
}

export function ItemEditor(props: ItemEditorProps) {
  switch (props.item.type) {
    case 'vitals_monitoring': return <VitalsMonitoringEditor {...props as any} />;
    case 'medication':        return <MedicationEditor {...props as any} />;
    case 'iv_fluid':          return <IvFluidEditor {...props as any} />;
    case 'lab':               return <LabEditor {...props as any} />;
    case 'task':              return <TaskEditor {...props as any} />;
    case 'bz_sliding_scale':  return <BzSlidingScaleEditor {...props as any} />;
  }
}

export function useItemTypeLabels(): Record<PostopOrderItemType, string> {
  const { t } = useTranslation();
  return {
    vitals_monitoring: t('postopOrders.editor.vitalsMonitoring', 'Vitals Monitoring'),
    medication: t('postopOrders.editor.medication', 'Medication'),
    iv_fluid: t('postopOrders.editor.ivFluid', 'IV Fluid'),
    lab: t('postopOrders.editor.lab', 'Lab'),
    task: t('postopOrders.editor.task', 'Task'),
    bz_sliding_scale: t('postopOrders.editor.bzSlidingScale', 'BG Sliding Scale'),
  };
}

export function useTaskSubtypeLabels(): Record<import('@shared/postopOrderItems').TaskSubtype, string> {
  const { t } = useTranslation();
  return {
    generic:      t('postopOrders.taskSubtype.generic', 'Task'),
    positioning:  t('postopOrders.taskSubtype.positioning', 'Positioning'),
    drainage:     t('postopOrders.taskSubtype.drainage', 'Drainage'),
    nutrition:    t('postopOrders.taskSubtype.nutrition', 'Nutrition'),
    wound_care:   t('postopOrders.taskSubtype.woundCare', 'Wound Care'),
    mobilization: t('postopOrders.taskSubtype.mobilization', 'Mobilization'),
    note:         t('postopOrders.taskSubtype.note', 'Note'),
  };
}
```

(The `ItemCategory` / `ITEM_CATEGORY` / `CATEGORY_ORDER` / `useCategoryLabels` / `ITEM_TYPE_LABELS` exports are intentionally removed — the new `PostopOrdersEditor` owns its own card grouping logic and does not need a category map.)

- [ ] **Step 3: Replace `client/src/components/anesthesia/postop/itemEditors/TaskEditor.tsx`**

Read the current file first to see its layout. Replace its body to add the subtype Select at the top and optional note textarea at the bottom. Sketch:

```tsx
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskItem, TaskSubtype } from '@shared/postopOrderItems';
import { ALLOWED_MODES_BY_TYPE } from '@shared/postopOrderItems';
import { TimingField } from './TimingField';
import { useTaskSubtypeLabels } from './index';
import type { ItemEditorProps } from './index';

export function TaskEditor({ item, onChange, onRemove }: ItemEditorProps<TaskItem>) {
  const { t } = useTranslation();
  const subtypeLabels = useTaskSubtypeLabels();

  return (
    <div className="border rounded-md p-3 space-y-3 bg-card">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t('postopOrders.editor.subtype', 'Type')}</Label>
              <Select
                value={item.subtype}
                onValueChange={(v) => onChange({ ...item, subtype: v as TaskSubtype })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(subtypeLabels) as [TaskSubtype, string][]).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">{t('postopOrders.editor.title', 'Description')}</Label>
              <Input
                value={item.title}
                onChange={(e) => onChange({ ...item, title: e.target.value })}
                placeholder={t('postopOrders.editor.taskTitlePlaceholder', 'e.g. Head up 30°, Redon left axilla, NPO 2h')}
              />
            </div>
          </div>

          <TimingField
            value={item.timing}
            onChange={(timing) => onChange({ ...item, timing })}
            allowedModes={ALLOWED_MODES_BY_TYPE.task}
          />

          <div>
            <Label className="text-xs">{t('postopOrders.editor.note', 'Note (optional)')}</Label>
            <Textarea
              rows={2}
              value={item.note ?? ''}
              onChange={(e) => onChange({ ...item, note: e.target.value || undefined })}
              placeholder={t('postopOrders.editor.notePlaceholder', 'Additional clinical context')}
            />
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} className="shrink-0" data-testid="button-remove-task-item">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add new i18n keys**

In `client/src/i18n/locales/en/translation.json`, find the `"postopOrders"` block. Add (or merge into the existing `"editor"` and a new `"taskSubtype"` group):

```json
"postopOrders": {
  "editor": {
    "subtype": "Type",
    "title": "Description",
    "taskTitlePlaceholder": "e.g. Head up 30°, Redon left axilla, NPO 2h",
    "note": "Note (optional)",
    "notePlaceholder": "Additional clinical context"
  },
  "taskSubtype": {
    "generic": "Task",
    "positioning": "Positioning",
    "drainage": "Drainage",
    "nutrition": "Nutrition",
    "woundCare": "Wound Care",
    "mobilization": "Mobilization",
    "note": "Note"
  }
}
```

In `client/src/i18n/locales/de/translation.json`, mirror the structure with German labels:

```json
"postopOrders": {
  "editor": {
    "subtype": "Typ",
    "title": "Beschreibung",
    "taskTitlePlaceholder": "z.B. Oberkörper 30°, Redon links axillär, Nüchtern 2h",
    "note": "Notiz (optional)",
    "notePlaceholder": "Zusätzlicher klinischer Kontext"
  },
  "taskSubtype": {
    "generic": "Aufgabe",
    "positioning": "Lagerung",
    "drainage": "Drainage",
    "nutrition": "Ernährung",
    "woundCare": "Wundversorgung",
    "mobilization": "Mobilisation",
    "note": "Notiz"
  }
}
```

(Add into the existing `postopOrders` block if it already has nested keys; do not overwrite.)

- [ ] **Step 5: Run typecheck (expect remaining errors in unmigrated consumers)**

Run: `npm run check 2>&1 | grep -E "TaskEditor|itemEditors/index"`
Expected: empty (no errors in TaskEditor or the editors index).

Other files (`OrdersGlanceCard.tsx`, `OrderSetEditorDialog.tsx`, `Op.tsx`, etc.) still error — they're addressed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/postop/itemEditors/ \
        client/src/i18n/locales/en/translation.json \
        client/src/i18n/locales/de/translation.json
git commit -m "feat(postop): refresh TaskEditor with subtype + note; delete 6 collapsed editors"
```

---

## Task 4: Update non-editor consumers

**Files:**
- Modify: `client/src/components/anesthesia/postop/AiPasteOrders.tsx`
- Modify: `client/src/components/anesthesia/postop/postopTasksLogic.ts`
- Modify: `tests/client/postopTasksLogic.test.ts`

- [ ] **Step 1: `AiPasteOrders.tsx` preview formatter**

Read the file. Find the `formatItem` (or equivalent) switch on `item.type` around lines 30-60. Remove cases for `mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `free_text`. Update the `task` case to include subtype + note in the preview, e.g.:

```ts
case 'task': {
  const subtypeLabel = item.subtype === 'generic' ? '' : `[${item.subtype}] `;
  return `${subtypeLabel}${item.title}${item.note ? ` — ${item.note}` : ''}`;
}
```

(If a `Map` of type → display formatters is used, delete the 6 keys.)

- [ ] **Step 2: `postopTasksLogic.ts` filter**

Read the file. Locate any references to deleted types. Most likely the file already filters on `item.type === 'task'` and `item.timing.mode === 'ad_hoc' | 'conditional'` (verified during the unified-timing migration). If `wound_care` appears anywhere, remove it — those items are now `task` with `subtype: 'wound_care'` and the existing `task` filter already covers them.

- [ ] **Step 3: Update `tests/client/postopTasksLogic.test.ts`**

Read the file. Find any test fixture using deleted types. Convert: `{ type: 'wound_care', check: 'daily', timing: ... }` → `{ type: 'task', subtype: 'wound_care', title: 'Wundkontrolle', timing: ... }`. Run the test to verify.

Run: `npx vitest run tests/client/postopTasksLogic.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/anesthesia/postop/AiPasteOrders.tsx \
        client/src/components/anesthesia/postop/postopTasksLogic.ts \
        tests/client/postopTasksLogic.test.ts
git commit -m "feat(postop): migrate AiPasteOrders + postopTasksLogic to task subtype"
```

---

## Task 5: Update server-side (AI parser + seed)

**Files:**
- Modify: `server/services/postopOrderAIParser.ts`
- Modify: `server/seed/postopOrderTemplates.ts`

- [ ] **Step 1: Update SYSTEM_PROMPT in the AI parser**

Read `server/services/postopOrderAIParser.ts`. The SYSTEM_PROMPT defines the JSON shape the LLM must emit. Locate the type definitions (around lines 15-30). Remove all references to: `mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `free_text`.

Update the `task` definition to include `subtype`:

```
- task: { id: string (uuid), type: "task", subtype: "generic"|"positioning"|"drainage"|"nutrition"|"wound_care"|"mobilization"|"note", title: string, timing: { mode: "scheduled"|"one_shot"|"ad_hoc"|"conditional", frequency?: "q1h"|"q2h"|"q4h"|"q6h"|"q8h"|"q12h"|"q24h"|"q48h"|"weekly", startAt?: string (ISO 8601), end?: { kind: "indefinite" } | { kind: "until", at: string } | { kind: "count", n: number }, condition?: string }, actionHint?: string, note?: string }
```

Replace the body of the prompt's "Mapping" guidance. Where the prompt previously said "positioning items use the `positioning` type", change to "positioning items use `task` with `subtype: 'positioning'` and the position description in `title`". Mirror the same translation for drainage, nutrition, wound_care, mobilization, note (= `free_text`).

(Concrete example for the prompt body:)
```
Mapping:
- "Mobilization" or "Lagerung" or "Positioning" → task with subtype "positioning" or "mobilization"; describe in title.
- "Drainage" or "Redon" or "Easyflow" → task with subtype "drainage"; describe drain type + site in title.
- "Nutrition" / "Diet" / "NPO" / "Vollkost" → task with subtype "nutrition"; describe in title.
- "Wound care" / "Verbandwechsel" → task with subtype "wound_care"; for scheduled dressing changes set timing.mode = "scheduled" + appropriate frequency.
- "Note" / "Comment" / freeform observation → task with subtype "note"; description in title.
```

- [ ] **Step 2: Update seed templates**

Read `server/seed/postopOrderTemplates.ts`. Find the 4 seeded items currently using deleted types (lines 8-11 per recent inspection):

```ts
{ id: id(), type: 'mobilization', value: 'free' },
{ id: id(), type: 'positioning', value: 'head_up_30' },
{ id: id(), type: 'nutrition', value: 'vollkost', startAfter: '2h postop' },
{ id: id(), type: 'wound_care', check: 'daily', timing: { mode: 'ad_hoc' } },
```

Replace with task equivalents:

```ts
{ id: id(), type: 'task', subtype: 'mobilization', title: 'Freie Mobilisation', timing: { mode: 'ad_hoc' } },
{ id: id(), type: 'task', subtype: 'positioning', title: 'Oberkörper 30° hochgelagert', timing: { mode: 'ad_hoc' } },
{ id: id(), type: 'task', subtype: 'nutrition', title: 'Vollkost ab 2h postop', timing: { mode: 'ad_hoc' } },
{ id: id(), type: 'task', subtype: 'wound_care', title: 'Wundkontrolle täglich', timing: { mode: 'scheduled', frequency: 'q24h' } },
```

(The wound-care item's `check: 'daily'` semantics map to a scheduled q24h `task` with subtype `wound_care`; the legacy `ad_hoc` timing was a soft default. If a different mapping is preferred for clinical accuracy, prefer `q24h`.)

- [ ] **Step 3: Run typecheck**

Run: `npm run check 2>&1 | grep -E "postopOrderAIParser|postopOrderTemplates"`
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add server/services/postopOrderAIParser.ts server/seed/postopOrderTemplates.ts
git commit -m "feat(postop): migrate AI parser prompt + seed templates to task subtype"
```

---

## Task 6: Build the new `PostopOrdersEditor` component

**Files:**
- Create: `client/src/components/anesthesia/postop/PostopOrdersEditor.tsx`

- [ ] **Step 1: Create the file with the full component**

Create `client/src/components/anesthesia/postop/PostopOrdersEditor.tsx` with:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, ChevronDown, ChevronRight, Pill, Activity, FlaskConical, ClipboardList, Save } from 'lucide-react';
import { createEmptyItem, type PostopOrderItem, type PostopOrderItemType } from '@shared/postopOrderItems';
import { ItemEditor } from './itemEditors';
import type { TemplateRow } from '@/hooks/usePostopOrderTemplates';
import { AiPasteOrders } from './AiPasteOrders';

type CardKey = 'medications' | 'monitoring' | 'labs' | 'tasks';

const CARD_TYPES: Record<CardKey, PostopOrderItemType[]> = {
  medications: ['medication', 'iv_fluid', 'bz_sliding_scale'],
  monitoring:  ['vitals_monitoring'],
  labs:        ['lab'],
  tasks:       ['task'],
};

const CARD_ICON: Record<CardKey, React.ComponentType<{ className?: string }>> = {
  medications: Pill,
  monitoring: Activity,
  labs: FlaskConical,
  tasks: ClipboardList,
};

interface Props {
  items: PostopOrderItem[];
  templateId: string | null;
  templates: TemplateRow[];
  canEdit: boolean;
  hospitalId?: string;
  onChange: (next: { items: PostopOrderItem[]; templateId: string | null }) => void;
  onSaveAsTemplate?: (payload: { name: string; items: PostopOrderItem[]; overwriteId?: string }) => void;
}

export function PostopOrdersEditor({ items, templateId, templates, canEdit, hospitalId, onChange, onSaveAsTemplate }: Props) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiPasteOpen, setAiPasteOpen] = useState(false);

  const cardLabels: Record<CardKey, string> = {
    medications: t('postopOrders.cards.medications', 'Medications'),
    monitoring:  t('postopOrders.cards.monitoring', 'Monitoring'),
    labs:        t('postopOrders.cards.labs', 'Labs'),
    tasks:       t('postopOrders.cards.tasks', 'Tasks'),
  };

  const itemsByCard: Record<CardKey, PostopOrderItem[]> = {
    medications: items.filter(i => CARD_TYPES.medications.includes(i.type as any)),
    monitoring:  items.filter(i => CARD_TYPES.monitoring.includes(i.type as any)),
    labs:        items.filter(i => CARD_TYPES.labs.includes(i.type as any)),
    tasks:       items.filter(i => CARD_TYPES.tasks.includes(i.type as any)),
  };

  const applyTemplate = (tid: string) => {
    const tpl = templates.find(t => t.id === tid);
    if (!tpl) return;
    const cloned = tpl.items.map(i => ({ ...i, id: crypto.randomUUID() }));
    onChange({ items: cloned, templateId: tid });
  };

  const addItem = (type: PostopOrderItemType) => {
    const next = [createEmptyItem(type, crypto.randomUUID()), ...items];
    onChange({ items: next, templateId });
    setExpandedId(next[0].id);
  };

  const updateItem = (id: string, next: PostopOrderItem) => {
    onChange({ items: items.map(i => i.id === id ? next : i), templateId });
  };

  const removeItem = (id: string) => {
    onChange({ items: items.filter(i => i.id !== id), templateId });
    if (expandedId === id) setExpandedId(null);
  };

  const appendItems = (newItems: PostopOrderItem[]) => {
    onChange({ items: [...newItems.slice().reverse(), ...items], templateId });
  };

  const cleanItemsForPersist = (): PostopOrderItem[] =>
    items.map((it: any) => {
      const { _unmapped, ...rest } = it;
      return rest as PostopOrderItem;
    });

  return (
    <Card data-testid="postop-orders-editor">
      <CardContent className="p-4 space-y-4">
        {/* Header: title left, template top-right */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm uppercase tracking-wide text-muted-foreground font-medium">
            {t('postopOrders.ordersAtAGlance', 'Postoperative Orders')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('postopOrders.template', 'Template')}:</span>
            <Select value={templateId ?? ''} onValueChange={applyTemplate} disabled={!canEdit}>
              <SelectTrigger className="w-[220px] h-8 text-xs">
                <SelectValue placeholder={t('postopOrders.editor.selectTemplate', 'Choose template...')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map(tpl => <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 2x2 grid of sub-cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(CARD_TYPES) as CardKey[]).map(key => (
            <SubCard
              key={key}
              title={cardLabels[key]}
              Icon={CARD_ICON[key]}
              items={itemsByCard[key]}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              canEdit={canEdit}
              hospitalId={hospitalId}
              onUpdate={updateItem}
              onRemove={removeItem}
              onAdd={() => {
                if (key === 'medications') {
                  // Medication card keeps the multi-type dropdown
                  return null;
                }
                addItem(CARD_TYPES[key][0]);
              }}
              addMenu={key === 'medications' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={!canEdit} data-testid={`add-${key}`}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => addItem('medication')}>{t('postopOrders.editor.medication', 'Medication')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addItem('iv_fluid')}>{t('postopOrders.editor.ivFluid', 'IV Fluid')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addItem('bz_sliding_scale')}>{t('postopOrders.editor.bzSlidingScale', 'BG Sliding Scale')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            />
          ))}
        </div>

        {/* AI paste — collapsed trigger at bottom */}
        {canEdit && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setAiPasteOpen(!aiPasteOpen)}
              data-testid="toggle-ai-paste"
            >
              {aiPasteOpen ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
              {t('postopOrders.aiPasteToggle', 'AI paste orders…')}
            </Button>
            {aiPasteOpen && (
              <div className="mt-2">
                <AiPasteOrders hospitalId={hospitalId} existingItems={items} onApply={appendItems} />
              </div>
            )}
          </div>
        )}

        {/* Save as template */}
        {canEdit && onSaveAsTemplate && items.length > 0 && (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Save className="w-3.5 h-3.5 mr-1" />
                  {t('postopOrders.editor.saveAsTemplate', 'Save as template')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => {
                  const name = window.prompt(t('postopOrders.editor.templateNamePrompt', 'Template name:'));
                  if (name?.trim()) onSaveAsTemplate({ name: name.trim(), items: cleanItemsForPersist() });
                }}>
                  {t('postopOrders.editor.saveAsNew', 'Save as new template')}
                </DropdownMenuItem>
                {templates.length > 0 && <DropdownMenuSeparator />}
                {templates.map(tpl => (
                  <DropdownMenuItem key={tpl.id} onClick={() => onSaveAsTemplate({ name: tpl.name, items: cleanItemsForPersist(), overwriteId: tpl.id })}>
                    {t('postopOrders.editor.overwrite', 'Overwrite')}: {tpl.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SubCardProps {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  items: PostopOrderItem[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  canEdit: boolean;
  hospitalId?: string;
  onUpdate: (id: string, next: PostopOrderItem) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addMenu?: React.ReactNode;
}

function SubCard({ title, Icon, items, expandedId, setExpandedId, canEdit, hospitalId, onUpdate, onRemove, onAdd, addMenu }: SubCardProps) {
  return (
    <div className="border rounded-md bg-card/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
          {items.length > 0 && <Badge variant="secondary" className="text-xs">{items.length}</Badge>}
        </div>
        {canEdit && (addMenu ?? (
          <Button size="sm" variant="ghost" onClick={onAdd} data-testid={`add-${title.toLowerCase()}`}>
            <Plus className="w-4 h-4" />
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground italic py-2">—</div>
        )}
        {items.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            canEdit={canEdit}
            hospitalId={hospitalId}
            onClick={() => canEdit && setExpandedId(expandedId === item.id ? null : item.id)}
            onUpdate={(next) => onUpdate(item.id, next)}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: PostopOrderItem;
  expanded: boolean;
  canEdit: boolean;
  hospitalId?: string;
  onClick: () => void;
  onUpdate: (item: PostopOrderItem) => void;
  onRemove: () => void;
}

function ItemRow({ item, expanded, canEdit, hospitalId, onClick, onUpdate, onRemove }: ItemRowProps) {
  if (expanded) {
    return (
      <div className="rounded border border-primary/40 bg-background p-2">
        <ItemEditor
          item={item}
          onChange={onUpdate}
          onRemove={onRemove}
          hospitalId={hospitalId}
        />
      </div>
    );
  }
  return (
    <div
      className={`rounded border bg-background/40 px-2 py-1.5 text-xs flex items-center justify-between ${canEdit ? 'cursor-pointer hover:bg-background/80' : ''}`}
      onClick={onClick}
      data-testid={`item-row-${item.id}`}
    >
      <span className="truncate">{summarize(item)}</span>
      <span className="text-muted-foreground ml-2 shrink-0">{summarizeMeta(item)}</span>
    </div>
  );
}

function summarize(item: PostopOrderItem): string {
  switch (item.type) {
    case 'medication':        return `${item.medicationRef || '—'} ${item.dose} ${item.route}`;
    case 'iv_fluid':          return `${item.solution} ${item.volumeMl}ml`;
    case 'bz_sliding_scale':  return `BG sliding scale (${item.drug})`;
    case 'vitals_monitoring': return item.parameter;
    case 'lab':               return item.panel.join(', ') || '—';
    case 'task':              return `${item.subtype !== 'generic' ? `[${item.subtype}] ` : ''}${item.title || '—'}`;
  }
}

function summarizeMeta(item: PostopOrderItem): string {
  const t = (item as any).timing;
  if (!t) return '';
  if (t.mode === 'ad_hoc') return 'PRN';
  if (t.mode === 'conditional') return 'cond.';
  if (t.mode === 'one_shot') return '1×';
  if (t.mode === 'scheduled') return t.frequency ?? 'sched';
  return '';
}
```

- [ ] **Step 2: Add new i18n keys for the editor's labels**

In `client/src/i18n/locales/en/translation.json`, under `"postopOrders"`, add:

```json
"cards": {
  "medications": "Medications",
  "monitoring": "Monitoring",
  "labs": "Labs",
  "tasks": "Tasks"
},
"aiPasteToggle": "AI paste orders…"
```

Mirror in `de/translation.json`:

```json
"cards": {
  "medications": "Medikation",
  "monitoring": "Monitoring",
  "labs": "Labor",
  "tasks": "Aufgaben"
},
"aiPasteToggle": "KI-Paste Verordnungen…"
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check 2>&1 | grep PostopOrdersEditor`
Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/anesthesia/postop/PostopOrdersEditor.tsx \
        client/src/i18n/locales/en/translation.json \
        client/src/i18n/locales/de/translation.json
git commit -m "feat(postop): add reusable PostopOrdersEditor component (2x2 inline)"
```

---

## Task 7: Wire `PostopOrdersEditor` into Op.tsx; delete the dialog and the glance card

**Files:**
- Modify: `client/src/pages/anesthesia/Op.tsx`
- Delete: `client/src/components/anesthesia/postop/OrderSetEditorDialog.tsx`
- Delete: `client/src/components/anesthesia/postop/OrdersGlanceCard.tsx`

- [ ] **Step 1: Replace both call sites in `Op.tsx`**

Read lines 1485-1605 and 2335-2380. Two paired patterns exist: each is `<OrdersGlanceCard ... />` followed (somewhere later in the JSX tree) by `<OrderSetEditorDialog ... />`. Replace each pair with a single `<PostopOrdersEditor>` element.

For the first call site (around line 1490):

```tsx
<div className="flex-1">
  <PostopOrdersEditor
    items={postopOrderSet.data?.orderSet.items ?? []}
    templateId={postopOrderSet.data?.orderSet.templateId ?? null}
    templates={postopTemplates.data ?? []}
    canEdit={!anesthesiaRecord?.isLocked}
    hospitalId={activeHospital?.id}
    onChange={({ items, templateId }) => handleSaveOrderSet({ items, templateId })}
    onSaveAsTemplate={(payload) => {
      if (payload.overwriteId) {
        postopTemplates.update.mutate({ id: payload.overwriteId, patch: { items: payload.items } });
      } else {
        postopTemplates.create.mutate({
          hospitalId: activeHospital?.id ?? '',
          name: payload.name,
          description: null,
          items: payload.items,
          procedureCode: null,
        });
      }
    }}
  />
</div>
```

(Delete the `<OrderSetEditorDialog ... />` block previously at line 1600-1633.)

For the second call site (around line 2342), apply the same replacement (drop the surrounding `<OrdersGlanceCard>` and the `<OrderSetEditorDialog>` block).

- [ ] **Step 2: Drop `orderEditorOpen` state**

Find `const [orderEditorOpen, setOrderEditorOpen] = useState(false);` (search for it in Op.tsx) and delete the line. Search for any remaining `setOrderEditorOpen` references and remove them — every entry should now be unused.

- [ ] **Step 3: Update imports**

Replace the two imports at the top of `Op.tsx`:

```tsx
import { OrdersGlanceCard } from "@/components/anesthesia/postop/OrdersGlanceCard";
// ...
import { OrderSetEditorDialog } from "@/components/anesthesia/postop/OrderSetEditorDialog";
```

with the single line:

```tsx
import { PostopOrdersEditor } from "@/components/anesthesia/postop/PostopOrdersEditor";
```

- [ ] **Step 4: Verify `handleSaveOrderSet` accepts the new payload**

Search Op.tsx for `handleSaveOrderSet`. The current signature accepts `{ items, templateId }` — that matches the `onChange` payload. No change needed if so. If the signature differs, add a tiny adapter:

```tsx
const onOrdersChange = ({ items, templateId }: { items: PostopOrderItem[]; templateId: string | null }) => {
  handleSaveOrderSet({ items, templateId });
};
```

- [ ] **Step 5: Delete the now-unused dialog and glance card files**

```bash
rm client/src/components/anesthesia/postop/OrderSetEditorDialog.tsx \
   client/src/components/anesthesia/postop/OrdersGlanceCard.tsx
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: PASS — 0 errors.

If errors remain, address them:
- Stale references to `OrdersGlanceCard` / `OrderSetEditorDialog`: remove
- Stale references to `ITEM_CATEGORY` / `useCategoryLabels`: remove (those are gone)
- Stale `MobilizationItem` etc. type imports: remove

- [ ] **Step 7: Run all tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS (postop suites). The pre-existing 9 unrelated failures (idle-logout, leads-metrics, etc.) remain — they are not in scope and confirmed pre-existing on main.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(postop): wire PostopOrdersEditor inline; delete OrderSetEditorDialog + OrdersGlanceCard"
```

---

## Task 8: Wipe stale dev rows and smoke-test (operator)

**Files:**
- (no code changes)

- [ ] **Step 1: Wipe existing dev postop order rows**

Run:
```bash
psql "$DATABASE_URL" -c "DELETE FROM anesthesia_postop_orders;"
```

(Required because the existing rows reference deleted item types and would crash the new UI on render. No production data exists.)

- [ ] **Step 2: Boot the dev server and walk the editor**

Run: `npm run dev`. Open a patient → anesthesia → Postop tab. Verify:

- The editor renders inline (no modal).
- 4 sub-cards visible: Medications, Monitoring, Labs, Tasks.
- Template selector top-right of the editor.
- Click "+" on Monitoring → a vitals_monitoring item appears, expanded inline.
- Click "+" on Tasks → a task item appears with the subtype dropdown showing 7 options (Task / Positioning / Drainage / Nutrition / Wound Care / Mobilization / Note).
- Click "+" on Medications → 3-item dropdown appears (Medication / IV Fluid / Sliding Scale).
- Click "+" on Labs → a lab item appears.
- Type into a field — the change persists (refresh page to verify).
- Click another row → first row collapses, second expands.
- Click the same expanded row again → collapses back to summary.
- "AI paste orders" trigger expands the textarea.
- "Save as template" still saves a template (verify by re-opening another patient and selecting the template).
- Lock the anesthesia record → verify all edit affordances disappear (no + buttons, rows non-clickable, no AI paste, no save-as-template, template select disabled).

- [ ] **Step 3: Final commit (only if Step 2 surfaced fixes)**

If Step 2 surfaced minor bugs, fix them and:

```bash
git add -A
git commit -m "fix(postop): smoke-test follow-ups for inline editor"
```

If no fixes needed, skip this commit.

---

## Self-Review

**Spec coverage:**

- [✓] 4 sub-cards (Medications / Monitoring / Labs / Tasks) — Task 6 (`CARD_TYPES`)
- [✓] Per-card "+" button — Task 6 (`onAdd` per SubCard, with `addMenu` override for Medications)
- [✓] Template picker top-right — Task 6 (header div in `PostopOrdersEditor`)
- [✓] Click row → expand inline editor — Task 6 (`expandedId` state, `ItemRow.expanded`)
- [✓] Auto-save on every change — Task 6 (component is controlled; parent's `handleSaveOrderSet` handles persistence — wired in Task 7)
- [✓] AI paste collapsed at bottom — Task 6 (`aiPasteOpen` state)
- [✓] Read-only via `canEdit=false` — Task 6 (every `+`, click, AI paste, save-as-template gated by `canEdit`)
- [✓] TaskItem subtype + note — Task 1
- [✓] Delete 6 item types — Task 1
- [✓] Delete 6 editor files — Task 3
- [✓] Delete OrderSetEditorDialog + OrdersGlanceCard — Task 7
- [✓] AI parser SYSTEM_PROMPT update — Task 5
- [✓] Seed templates migration — Task 5
- [✓] Test updates — Tasks 1, 2, 4
- [✓] Dev DB wipe — Task 8

**Type consistency:** `TaskSubtype` defined in Task 1, used in Tasks 3 (TaskEditor + index helper), 4 (preview formatter), 5 (AI parser + seed), 6 (component summarize + types — uses `item.subtype` only on `task` branch, type-safe). `CARD_TYPES` in Task 6 uses literal item-type strings matching `PostopOrderItemType` from Task 1.

**Placeholder scan:** none. No "TBD" / "implement later" / unspecified-detail steps.

Plan complete and saved to `docs/superpowers/plans/2026-05-07-postop-orders-inline-editor.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
