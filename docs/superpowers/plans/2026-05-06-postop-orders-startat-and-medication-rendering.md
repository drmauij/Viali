# Postop Orders — Start Time + Medication Picker Constraint + Swimlane Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a uniform `startAt` field to schedulable postop order items, constrain the medication picker to medications with a swimlane configuration, and render ordered medications in the medications swimlane with a `Verordnet`/`Ordered` tag, two-line label, per-row planned pills, and an alerts-only top strip.

**Architecture:** Pure additive changes to JSONB item schemas (no DB migration). Editor inputs use the existing `dateTimeLocalToISO` helper for parsing. Swimlane row inventory becomes a union of administered/always-show/ordered medications. The Phase 3 top-strip filter narrows from "all planned" to "overdue + due-now only"; future events live exclusively in per-row pills inside each medication's track. Server-side validation enforces the picker constraint defensively.

**Tech Stack:** TypeScript, React, Vitest, Drizzle ORM (read-only here), Express, Tailwind, shadcn/ui, react-i18next.

**Spec:** `docs/superpowers/specs/2026-05-06-postop-orders-startat-and-medication-rendering-design.md`

---

## Phase A — Start time on order items

### Task A1: Add `startAt?: string` to schedulable item type definitions

**Files:**
- Modify: `shared/postopOrderItems.ts`

- [ ] **Step 1: Read the file** to confirm current shape (already known: `MedicationItem` and `IvFluidItem` have `startAt?: string`; `LabItem`, `TaskItem`, `VitalsMonitoringItem`, `BzSlidingScaleItem`, `WoundCareItem` do not).

- [ ] **Step 2: Add `startAt?: string` to the missing item types.** Apply the following edits:

In `LabItem`:

```ts
export interface LabItem {
  id: ItemId; type: 'lab';
  panel: string[];
  when: 'one_shot' | 'daily' | 'every_n_hours';
  startAt?: string;                // ISO 8601 — first event time; falls back to oneShotOffsetH or now()
  oneShotOffsetH?: number;
  everyNHours?: number;
  thresholds?: Array<{ param: string; op: '<' | '>'; value: number; action: string }>;
}
```

In `TaskItem`:

```ts
export interface TaskItem {
  id: ItemId; type: 'task';
  title: string;
  when: 'one_shot' | 'daily' | 'every_n_hours' | 'ad_hoc' | 'conditional';
  startAt?: string;                // ISO 8601 — first event time; falls back to oneShotAt or now()
  oneShotAt?: string;
  everyNHours?: number;
  condition?: string;
  actionHint?: string;
}
```

In `VitalsMonitoringItem`:

```ts
export interface VitalsMonitoringItem {
  id: ItemId; type: 'vitals_monitoring';
  parameter: 'BP' | 'pulse' | 'temp' | 'spo2' | 'bz';
  frequency: Frequency;
  startAt?: string;                // ISO 8601 — first event time; ignored when frequency='continuous'
  min?: number; max?: number;
  actionLow?: string; actionHigh?: string;
}
```

In `BzSlidingScaleItem`:

```ts
export interface BzSlidingScaleItem {
  id: ItemId; type: 'bz_sliding_scale';
  drug: string;
  startAt?: string;                // ISO 8601 — first measurement time
  rules: Array<{ above: number; units: number }>;
  increment?: { per: number; units: number };
}
```

In `WoundCareItem`:

```ts
export interface WoundCareItem {
  id: ItemId; type: 'wound_care';
  check: 'none' | 'daily' | 'twice_daily';
  dressingChange: 'none' | 'every_n_days' | 'on_soaking';
  startAt?: string;                // ISO 8601 — first dressing change (every_n_days mode)
  everyNDays?: number;
}
```

- [ ] **Step 3: Run `npm run check`** to verify TypeScript still compiles.

Run: `npm run check`
Expected: No new errors. Existing tests/code must compile because `startAt` is optional.

- [ ] **Step 4: Commit**

```bash
git add shared/postopOrderItems.ts
git commit -m "feat(postop-orders): add startAt to schedulable item types"
```

---

### Task A2: Update planning logic to honor `startAt` with legacy fallback

**Files:**
- Modify: `shared/postopOrderPlanning.ts`

- [ ] **Step 1: Add a helper** at the top of the file (just below `const HOUR = 3600_000;`):

```ts
function resolveAnchor(itemAnchor: string | undefined, fallback: number): number {
  if (!itemAnchor) return fallback;
  const parsed = Date.parse(itemAnchor);
  return Number.isNaN(parsed) ? fallback : parsed;
}
```

- [ ] **Step 2: Update the `medication` case** to honor `startAt`:

Replace the existing `case 'medication'` block (lines 37-46) with:

```ts
case 'medication': {
  if (item.scheduleMode !== 'scheduled') break;
  const freq = item.frequency as Frequency | undefined;
  if (!freq || freq === 'continuous') break;
  const interval = FREQUENCY_INTERVAL_H[freq as Exclude<Frequency, 'continuous'>];
  if (!interval) break;
  const start = resolveAnchor(item.startAt, anchor);
  const horizonRemaining = anchor + horizonH * HOUR - start;
  if (horizonRemaining <= 0) break;
  const count = Math.floor(horizonRemaining / (interval * HOUR));
  for (let i = 0; i < count; i++) {
    events.push({ itemId: item.id, kind: 'medication', plannedAt: start + i * interval * HOUR, payloadSnapshot: item });
  }
  break;
}
```

- [ ] **Step 3: Update `vitals_monitoring`** to honor `startAt`:

Replace the existing block (lines 48-59) with:

```ts
case 'vitals_monitoring': {
  const start = resolveAnchor(item.startAt, anchor);
  if (item.frequency === 'continuous') {
    events.push({ itemId: item.id, kind: 'vitals_check', plannedAt: start, payloadSnapshot: item });
    break;
  }
  const interval = FREQUENCY_INTERVAL_H[item.frequency];
  if (!interval) break;
  const horizonRemaining = anchor + horizonH * HOUR - start;
  if (horizonRemaining <= 0) break;
  const count = Math.floor(horizonRemaining / (interval * HOUR));
  for (let i = 0; i < count; i++) {
    events.push({ itemId: item.id, kind: 'vitals_check', plannedAt: start + i * interval * HOUR, payloadSnapshot: item });
  }
  break;
}
```

- [ ] **Step 4: Update `lab`** to prefer `startAt`, falling back to `oneShotOffsetH`:

Replace the existing block with:

```ts
case 'lab': {
  const start = item.startAt
    ? resolveAnchor(item.startAt, anchor)
    : (item.when === 'one_shot' ? anchor + (item.oneShotOffsetH ?? 0) * HOUR : anchor);
  const horizonRemaining = anchor + horizonH * HOUR - start;
  if (horizonRemaining <= 0) break;
  if (item.when === 'one_shot') {
    events.push({ itemId: item.id, kind: 'task', plannedAt: start, payloadSnapshot: item });
  } else if (item.when === 'daily') {
    const count = Math.max(1, Math.floor(horizonRemaining / (24 * HOUR)));
    for (let i = 0; i < count; i++) {
      events.push({ itemId: item.id, kind: 'task', plannedAt: start + i * 24 * HOUR, payloadSnapshot: item });
    }
  } else if (item.when === 'every_n_hours' && item.everyNHours && item.everyNHours > 0) {
    const count = Math.floor(horizonRemaining / (item.everyNHours * HOUR));
    for (let i = 0; i < count; i++) {
      events.push({ itemId: item.id, kind: 'task', plannedAt: start + i * item.everyNHours * HOUR, payloadSnapshot: item });
    }
  }
  break;
}
```

- [ ] **Step 5: Update `task`** to prefer `startAt`, falling back to `oneShotAt`:

Replace the existing block with:

```ts
case 'task': {
  if (item.when === 'ad_hoc' || item.when === 'conditional') break;
  const start = item.startAt
    ? resolveAnchor(item.startAt, anchor)
    : (item.when === 'one_shot' && item.oneShotAt ? Date.parse(item.oneShotAt) : anchor);
  const horizonRemaining = anchor + horizonH * HOUR - start;
  if (horizonRemaining <= 0) break;
  if (item.when === 'one_shot') {
    events.push({ itemId: item.id, kind: 'task', plannedAt: start, payloadSnapshot: item });
  } else if (item.when === 'daily') {
    const count = Math.max(1, Math.floor(horizonRemaining / (24 * HOUR)));
    for (let i = 0; i < count; i++) {
      events.push({ itemId: item.id, kind: 'task', plannedAt: start + i * 24 * HOUR, payloadSnapshot: item });
    }
  } else if (item.when === 'every_n_hours' && item.everyNHours && item.everyNHours > 0) {
    const count = Math.floor(horizonRemaining / (item.everyNHours * HOUR));
    for (let i = 0; i < count; i++) {
      events.push({ itemId: item.id, kind: 'task', plannedAt: start + i * item.everyNHours * HOUR, payloadSnapshot: item });
    }
  }
  break;
}
```

- [ ] **Step 6: `iv_fluid` already uses `startAt` — leave as-is.**

- [ ] **Step 7: Run typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add shared/postopOrderPlanning.ts
git commit -m "feat(postop-orders): planning logic honors startAt across item types"
```

---

### Task A3: Tests for `startAt` resolution

**Files:**
- Modify: `tests/shared/postopOrderPlanning.test.ts`

- [ ] **Step 1: Add a `describe` block** at the end of the file (before the final closing brace) covering the new `startAt` paths:

```ts
describe('startAt resolution', () => {
  it('medication startAt overrides anchor for first dose', () => {
    const start = anchor + 2 * 3600_000; // anchor + 2h
    const items: PostopOrderItem[] = [
      { id: 'm1', type: 'medication', medicationRef: 'amoxicillin', dose: '625mg', route: 'po',
        scheduleMode: 'scheduled', frequency: 'q8h', startAt: new Date(start).toISOString() },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events.map(e => e.plannedAt)).toEqual([
      start, start + 8 * 3600_000, start + 16 * 3600_000,
    ]);
  });

  it('medication without startAt falls back to anchor', () => {
    const items: PostopOrderItem[] = [
      { id: 'm2', type: 'medication', medicationRef: 'paracetamol', dose: '1g', route: 'iv',
        scheduleMode: 'scheduled', frequency: 'q8h' },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events[0].plannedAt).toBe(anchor);
  });

  it('lab startAt takes precedence over oneShotOffsetH', () => {
    const start = anchor + 5 * 3600_000;
    const items: PostopOrderItem[] = [
      { id: 'l1', type: 'lab', panel: ['Hb'], when: 'one_shot', oneShotOffsetH: 6,
        startAt: new Date(start).toISOString() },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events).toHaveLength(1);
    expect(events[0].plannedAt).toBe(start);
  });

  it('lab without startAt falls back to oneShotOffsetH (existing behavior)', () => {
    const items: PostopOrderItem[] = [
      { id: 'l2', type: 'lab', panel: ['Hb'], when: 'one_shot', oneShotOffsetH: 6 },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events[0].plannedAt).toBe(anchor + 6 * 3600_000);
  });

  it('task startAt overrides oneShotAt', () => {
    const start = anchor + 3 * 3600_000;
    const oneShotAt = new Date(anchor + 10 * 3600_000).toISOString();
    const items: PostopOrderItem[] = [
      { id: 't1', type: 'task', title: 'Verbandwechsel', when: 'one_shot', oneShotAt,
        startAt: new Date(start).toISOString() },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events[0].plannedAt).toBe(start);
  });

  it('vitals_monitoring honors startAt', () => {
    const start = anchor + 1 * 3600_000;
    const items: PostopOrderItem[] = [
      { id: 'v1', type: 'vitals_monitoring', parameter: 'BP', frequency: 'q4h',
        startAt: new Date(start).toISOString() },
    ];
    const events = planEvents(items, anchor, horizonH);
    // horizon=24h, start=anchor+1h, so 23h remaining -> 5 events at q4h
    expect(events.map(e => e.plannedAt)).toEqual([
      start, start + 4 * 3600_000, start + 8 * 3600_000, start + 12 * 3600_000, start + 16 * 3600_000,
    ]);
  });

  it('startAt outside horizon yields no events', () => {
    const start = anchor + 30 * 3600_000; // beyond 24h horizon
    const items: PostopOrderItem[] = [
      { id: 'm3', type: 'medication', medicationRef: 'xyz', dose: '1g', route: 'iv',
        scheduleMode: 'scheduled', frequency: 'q8h', startAt: new Date(start).toISOString() },
    ];
    expect(planEvents(items, anchor, horizonH)).toEqual([]);
  });

  it('invalid startAt string falls back to anchor', () => {
    const items: PostopOrderItem[] = [
      { id: 'm4', type: 'medication', medicationRef: 'xyz', dose: '1g', route: 'iv',
        scheduleMode: 'scheduled', frequency: 'q8h', startAt: 'not-a-date' },
    ];
    const events = planEvents(items, anchor, horizonH);
    expect(events[0].plannedAt).toBe(anchor);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/shared/postopOrderPlanning.test.ts`
Expected: all tests pass (existing + 8 new).

- [ ] **Step 3: Commit**

```bash
git add tests/shared/postopOrderPlanning.test.ts
git commit -m "test(postop-orders): cover startAt resolution and fallbacks"
```

---

### Task A4: i18n keys for "Start at"

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Locate the `postopOrders.editor` block** in `en.json` (line ~7050).

- [ ] **Step 2: Add to `en.json`** inside `postopOrders.editor` (alphabetical order is not enforced in this file — just add the keys at a reasonable spot, e.g. after `"note"`):

```json
      "startAt": "Start at",
      "startAtImmediate": "Immediately"
```

- [ ] **Step 3: Add to `de.json`** in the same `postopOrders.editor` block:

```json
      "startAt": "Beginn um",
      "startAtImmediate": "Sofort"
```

- [ ] **Step 4: Verify JSON is valid**

Run: `node -e "require('./client/src/i18n/locales/en.json'); require('./client/src/i18n/locales/de.json'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "i18n(postop-orders): add startAt label EN+DE"
```

---

### Task A5: Reusable `StartAtField` component

**Files:**
- Create: `client/src/components/anesthesia/postop/itemEditors/StartAtField.tsx`

A reusable inline `<datetime-local>` input + label. All editors in Tasks A6–A8 import this single component to avoid duplication.

- [ ] **Step 1: Create the component:**

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { dateTimeLocalToISO, formatDateTimeForInput } from '@/lib/dateUtils';

interface Props {
  value?: string;                             // ISO 8601 or undefined
  onChange: (next: string | undefined) => void;
}

/**
 * Optional "Start at" input. Empty value = undefined = "immediately" in planning logic.
 * Always uses local-wall-clock semantics; conversion to UTC ISO via dateTimeLocalToISO.
 */
export function StartAtField({ value, onChange }: Props) {
  const { t } = useTranslation();
  const localValue = value ? formatDateTimeForInput(value) : '';

  return (
    <div>
      <Label className="text-xs">{t('postopOrders.editor.startAt', 'Start at')}</Label>
      <Input
        type="datetime-local"
        value={localValue}
        placeholder={t('postopOrders.editor.startAtImmediate', 'Immediately')}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            onChange(undefined);
          } else {
            onChange(dateTimeLocalToISO(v));
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/anesthesia/postop/itemEditors/StartAtField.tsx
git commit -m "feat(postop-orders): reusable StartAtField component"
```

---

### Task A6: Wire `StartAtField` into Medication and IvFluid editors

**Files:**
- Modify: `client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx`
- Modify: `client/src/components/anesthesia/postop/itemEditors/IvFluidEditor.tsx`

- [ ] **Step 1:** In `MedicationEditor.tsx`, add the import next to the other component imports (around line 12):

```tsx
import { StartAtField } from './StartAtField';
```

- [ ] **Step 2:** Render `<StartAtField>` for `scheduled` mode. Find the existing `{item.scheduleMode === 'scheduled' && ( ... Frequency ...) }` block (line 209-214 in current code). Replace it with:

```tsx
{item.scheduleMode === 'scheduled' && (
  <div className="grid grid-cols-2 gap-2">
    <div>
      <Label className="text-xs">{t('postopOrders.editor.frequency', 'Frequency')}</Label>
      <Input value={item.frequency ?? ''} onChange={e => onChange({ ...item, frequency: e.target.value })} placeholder={t('postopOrders.editor.frequencyPlaceholder', 'e.g. q8h, 3x daily')} />
    </div>
    <StartAtField
      value={item.startAt}
      onChange={(startAt) => onChange({ ...item, startAt })}
    />
  </div>
)}
```

(PRN orders don't use `startAt` — leave the PRN block unchanged.)

- [ ] **Step 3:** In `IvFluidEditor.tsx`, add the import:

```tsx
import { StartAtField } from './StartAtField';
```

- [ ] **Step 4:** Read the file to find where duration/start is currently edited, then add a `<StartAtField>` next to existing fields. The IvFluid editor already supports `startAt` in the schema; just expose it. Pattern (verify exact placement during implementation by reading the current file structure):

```tsx
<StartAtField
  value={item.startAt}
  onChange={(startAt) => onChange({ ...item, startAt })}
/>
```

- [ ] **Step 5:** Typecheck

Run: `npm run check`
Expected: pass.

- [ ] **Step 6:** Manual smoke check — start dev server, open the OrderSetEditorDialog, verify "Start at" input appears in the medication editor (scheduled mode) and IvFluid editor.

Run: `npm run dev`

- [ ] **Step 7:** Commit

```bash
git add client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx client/src/components/anesthesia/postop/itemEditors/IvFluidEditor.tsx
git commit -m "feat(postop-orders): expose startAt in Medication + IvFluid editors"
```

---

### Task A7: Wire `StartAtField` into Lab and Task editors

**Files:**
- Modify: `client/src/components/anesthesia/postop/itemEditors/LabEditor.tsx`
- Modify: `client/src/components/anesthesia/postop/itemEditors/TaskEditor.tsx`

- [ ] **Step 1:** In `LabEditor.tsx`, add the import:

```tsx
import { StartAtField } from './StartAtField';
```

- [ ] **Step 2:** Add the field. Render only when `when` ∈ {`one_shot`, `daily`, `every_n_hours`}. Pattern:

```tsx
{(item.when === 'one_shot' || item.when === 'daily' || item.when === 'every_n_hours') && (
  <StartAtField
    value={item.startAt}
    onChange={(startAt) => onChange({ ...item, startAt })}
  />
)}
```

- [ ] **Step 3:** In `TaskEditor.tsx`, add the import and same conditional. Render when `when` ∈ {`one_shot`, `daily`, `every_n_hours`} — skip for `ad_hoc` and `conditional`:

```tsx
{(item.when === 'one_shot' || item.when === 'daily' || item.when === 'every_n_hours') && (
  <StartAtField
    value={item.startAt}
    onChange={(startAt) => onChange({ ...item, startAt })}
  />
)}
```

- [ ] **Step 4:** Typecheck

Run: `npm run check`
Expected: pass.

- [ ] **Step 5:** Commit

```bash
git add client/src/components/anesthesia/postop/itemEditors/LabEditor.tsx client/src/components/anesthesia/postop/itemEditors/TaskEditor.tsx
git commit -m "feat(postop-orders): expose startAt in Lab + Task editors"
```

---

### Task A8: Wire `StartAtField` into VitalsMonitoring, BzSlidingScale, WoundCare editors

**Files:**
- Modify: `client/src/components/anesthesia/postop/itemEditors/VitalsMonitoringEditor.tsx`
- Modify: `client/src/components/anesthesia/postop/itemEditors/BzSlidingScaleEditor.tsx`
- Modify: `client/src/components/anesthesia/postop/itemEditors/WoundCareEditor.tsx`

- [ ] **Step 1:** In `VitalsMonitoringEditor.tsx`, add the import and render `<StartAtField>` only when `frequency !== 'continuous'`:

```tsx
import { StartAtField } from './StartAtField';

// ... in JSX ...
{item.frequency !== 'continuous' && (
  <StartAtField
    value={item.startAt}
    onChange={(startAt) => onChange({ ...item, startAt })}
  />
)}
```

- [ ] **Step 2:** In `BzSlidingScaleEditor.tsx`, add the import and an unconditional `<StartAtField>`:

```tsx
import { StartAtField } from './StartAtField';

// ... in JSX ...
<StartAtField
  value={item.startAt}
  onChange={(startAt) => onChange({ ...item, startAt })}
/>
```

- [ ] **Step 3:** In `WoundCareEditor.tsx`, add the import and render only when `dressingChange === 'every_n_days'`:

```tsx
import { StartAtField } from './StartAtField';

// ... in JSX ...
{item.dressingChange === 'every_n_days' && (
  <StartAtField
    value={item.startAt}
    onChange={(startAt) => onChange({ ...item, startAt })}
  />
)}
```

- [ ] **Step 4:** Typecheck

Run: `npm run check`
Expected: pass.

- [ ] **Step 5:** Commit

```bash
git add client/src/components/anesthesia/postop/itemEditors/VitalsMonitoringEditor.tsx client/src/components/anesthesia/postop/itemEditors/BzSlidingScaleEditor.tsx client/src/components/anesthesia/postop/itemEditors/WoundCareEditor.tsx
git commit -m "feat(postop-orders): expose startAt in remaining schedulable editors"
```

---

## Phase B — Medication picker constraint

### Task B1: Verify the items API returns `administrationGroup`

**Files:**
- Read: `server/routes/items.ts` (the `GET /api/items/:hospitalId` handler)
- Read: `server/storage.ts` (the corresponding storage method)

Implementation-time investigation. The picker filters on `administrationGroup`, which lives on `medication_configs.administration_group` (per `shared/schema.ts:790`). Need to confirm whether the existing `/api/items/:hospitalId?unitId=...` response already joins this in.

- [ ] **Step 1: Read `server/routes/items.ts`** for the `GET /api/items/:hospitalId` route. Find the handler signature and storage call.

- [ ] **Step 2: Read the storage method** referenced (likely `storage.getItemsByHospital` or similar). Inspect the SQL/Drizzle query.

- [ ] **Step 3: Determine which case applies:**
  - **Case A**: `administrationGroup` already in the response (joined or returned). No backend change needed; proceed directly to Task B2.
  - **Case B**: `administrationGroup` is NOT in the response. Modify the storage method to LEFT JOIN `medication_configs` and project `administrationGroup`. Add a separate aggregation if there are N configs per item — pick "any non-null" or "first by sortOrder".

- [ ] **Step 4: If Case B, modify storage and route accordingly**, then add a quick smoke test:

```bash
curl 'http://localhost:5000/api/items/<hospitalId>?unitId=<unitId>' | jq '.[0:3] | map({name, administrationGroup})'
```

Expected: at least some items show `"administrationGroup": "antibiotics"` or another group; items not configured show `null`.

- [ ] **Step 5: Commit (only if backend changed)**

```bash
git add server/routes/items.ts server/storage.ts
git commit -m "feat(items): expose administrationGroup in items API for postop picker filter"
```

---

### Task B2: Filter MedicationEditor list and remove free-text fallback

**Files:**
- Modify: `client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx`

- [ ] **Step 1: Filter `dedupedItems`** to only include items where `administrationGroup` is set. Update the `useMemo` for `dedupedItems` (lines 30-57) to skip items lacking `administrationGroup`. Add early-skip filter:

Replace lines 30-57 with:

```tsx
const dedupedItems = useMemo(() => {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[.,/()[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  const groups = new Map<string, any>();
  for (const inv of inventoryItems) {
    // Only include medications with a swimlane configuration.
    if (!inv.administrationGroup) continue;
    const name: string = inv.name ?? '';
    const desc: string = inv.description ?? '';
    const canonical = desc.length > name.length ? desc : name;
    const key = normalize(canonical);
    if (!key) continue;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, inv);
      continue;
    }
    const existingFriendly = (existing.name ?? '') !== (existing.description ?? '');
    const currentFriendly = name !== desc;
    if (currentFriendly && !existingFriendly) {
      groups.set(key, inv);
    } else if (currentFriendly === existingFriendly &&
               (name?.length ?? Infinity) < (existing.name?.length ?? Infinity)) {
      groups.set(key, inv);
    }
  }
  return Array.from(groups.values());
}, [inventoryItems]);
```

- [ ] **Step 2: Remove the `addFreeText` function** (lines 76-80) entirely.

- [ ] **Step 3: Replace the `<CommandEmpty>` block** (lines 134-147). Remove the free-text button. New copy directs the user to the gear icon:

```tsx
<CommandEmpty>
  <div className="px-2 py-3 text-sm text-muted-foreground">
    {t('postopOrders.editor.noConfiguredMedication',
       'No matching medication — click the gear icon to configure a new one.')}
  </div>
</CommandEmpty>
```

- [ ] **Step 4: Remove the second free-text fallback** (the `searchQuery.trim() && filteredItems.length > 0` block, lines 164-174). Delete entirely.

- [ ] **Step 5: Add an empty-hospital state**, shown when `dedupedItems.length === 0` and `searchQuery` is empty. Insert just below the existing `<CommandList>` opening tag, before the `<CommandEmpty>`:

```tsx
{!searchQuery.trim() && dedupedItems.length === 0 && (
  <div className="px-2 py-3 text-sm">
    <div className="text-muted-foreground mb-2">
      {t('postopOrders.editor.noConfiguredMedications',
         'No medications are configured for the swimlane yet.')}
    </div>
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={() => { setOpen(false); setConfigOpen(true); }}
    >
      <Plus className="h-4 w-4 mr-1" />
      {t('postopOrders.editor.configureFirst', 'Configure your first medication')}
    </Button>
  </div>
)}
```

- [ ] **Step 6: Add i18n keys.** In `client/src/i18n/locales/en.json` under `postopOrders.editor`:

```json
      "noConfiguredMedication": "No matching medication — click the gear icon to configure a new one.",
      "noConfiguredMedications": "No medications are configured for the swimlane yet.",
      "configureFirst": "Configure your first medication"
```

In `client/src/i18n/locales/de.json` under `postopOrders.editor`:

```json
      "noConfiguredMedication": "Keine passende Medikation — klicken Sie auf das Zahnradsymbol, um eine neue zu konfigurieren.",
      "noConfiguredMedications": "Es sind noch keine Medikationen für den Verlauf konfiguriert.",
      "configureFirst": "Erste Medikation konfigurieren"
```

- [ ] **Step 7: Typecheck and JSON lint**

Run: `npm run check && node -e "require('./client/src/i18n/locales/en.json'); require('./client/src/i18n/locales/de.json'); console.log('ok')"`
Expected: pass + `ok`.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(postop-orders): constrain medication picker to configured meds, drop free-text"
```

---

### Task B3: Server-side validation backstop

**Files:**
- Modify: `server/routes/anesthesia/postopOrders.ts`
- Modify: `server/storage.ts` (or add a helper if no suitable lookup exists)

- [ ] **Step 1: Add a validator helper** at the top of `server/routes/anesthesia/postopOrders.ts`, just after the imports:

```ts
import { db } from "../../db";
import { items, medicationConfigs } from "@shared/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";

async function findUnconfiguredMedicationRefs(
  hospitalId: string,
  itemsArr: any[],
): Promise<string[]> {
  const refs = Array.from(new Set(
    itemsArr
      .filter(i => i?.type === 'medication' && typeof i.medicationRef === 'string' && i.medicationRef.trim())
      .map(i => i.medicationRef as string)
  ));
  if (refs.length === 0) return [];

  const rows = await db
    .select({ name: items.name, administrationGroup: medicationConfigs.administrationGroup })
    .from(items)
    .leftJoin(medicationConfigs, eq(medicationConfigs.itemId, items.id))
    .where(and(eq(items.hospitalId, hospitalId), inArray(items.name, refs)));

  const configuredNames = new Set(
    rows.filter(r => r.administrationGroup !== null).map(r => r.name)
  );
  return refs.filter(r => !configuredNames.has(r));
}
```

(Verify import paths during implementation — `db` may live elsewhere; adjust accordingly. The pattern is: find any medication item whose `medicationRef` does not resolve to an item with at least one `medication_configs.administration_group IS NOT NULL`.)

- [ ] **Step 2: Plumb `hospitalId` into the PUT handler.** The current handler at line 160 takes `recordId`. We need the hospitalId for filtering. Either:
  - (a) accept `hospitalId` from `req.body` (already passed for templates)
  - (b) look up the anesthesia record's surgery → hospital

Inspect the existing `requireStrictHospitalAccess` middleware — it usually attaches `req.hospitalId`. If so, use `req.hospitalId`.

- [ ] **Step 3: Update the PUT handler** at lines 160-184. Replace with:

```ts
router.put('/api/anesthesia/records/:recordId/postop-orders', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const { items: orderItems, templateId, sign } = req.body;
    if (!orderItems || !Array.isArray(orderItems)) {
      return res.status(400).json({ message: "items array is required" });
    }

    const hospitalId = req.hospitalId ?? req.body.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    // Validate that every medication item references a configured medication.
    const unconfigured = await findUnconfiguredMedicationRefs(hospitalId, orderItems);
    if (unconfigured.length > 0) {
      return res.status(400).json({
        message: "Some medications are not configured for the swimlane and cannot be ordered.",
        unconfiguredMedications: unconfigured,
      });
    }

    const userId = req.user?.id ?? null;
    const orderSet = await postopOrdersStorage.upsertOrderSet(recordId, {
      items: orderItems,
      templateId: templateId ?? null,
      signedBy: sign ? userId : null,
    });

    const planned = planEvents(orderItems, Date.now(), HORIZON_HOURS);
    await postopOrdersStorage.replacePlannedEvents(orderSet.id, planned);

    const plannedEvents = await postopOrdersStorage.listPlannedEvents(orderSet.id);
    res.json({ orderSet, plannedEvents });
  } catch (error) {
    logger.error("Error upserting postop order set:", error);
    res.status(500).json({ message: "Failed to upsert order set" });
  }
});
```

- [ ] **Step 4: Surface the validation error in the client.** In `OrderSetEditorDialog` (or wherever `postopOrderSet.save.mutate(payload)` is called from `Op.tsx`), the error response now includes `unconfiguredMedications`. Display a toast or inline error showing the list. Pattern (specifics depend on existing toast/error handling — apply consistent with the rest of the project):

```tsx
// in the save mutation's onError
if (error?.unconfiguredMedications?.length) {
  toast({
    title: t('postopOrders.editor.saveFailed', 'Could not save order set'),
    description: t('postopOrders.editor.unconfiguredMedsListed',
      'These medications are not configured: {{names}}',
      { names: error.unconfiguredMedications.join(', ') }
    ),
    variant: 'destructive',
  });
}
```

(Implementation detail: use the existing toast helper. Add the i18n keys above to en.json and de.json.)

- [ ] **Step 5: Add i18n keys.** EN:

```json
      "saveFailed": "Could not save order set",
      "unconfiguredMedsListed": "These medications are not configured: {{names}}"
```

DE:

```json
      "saveFailed": "Verordnungen konnten nicht gespeichert werden",
      "unconfiguredMedsListed": "Folgende Medikamente sind nicht konfiguriert: {{names}}"
```

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 7: Manual smoke test.** Start the dev server. Open an order set, attempt to save with a medication that has no `administrationGroup`. Expected: 400 response, toast shows the medication name. Then configure the medication via the gear icon and save again. Expected: success.

- [ ] **Step 8: Commit**

```bash
git add server/routes/anesthesia/postopOrders.ts server/storage.ts client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(postop-orders): server validates medicationRef against configured meds"
```

---

### Task B4: AI parser post-validation

**Files:**
- Modify: `client/src/components/anesthesia/postop/AiPasteOrders.tsx`

- [ ] **Step 1: Read `AiPasteOrders.tsx`** to find where the parsed AI items are merged into the editor state. Identify the post-parse callback.

- [ ] **Step 2: After AI parse returns**, mark each medication item that doesn't resolve to a configured medication. Use the same `dedupedItems` lookup the editor uses. Mark unmapped items with a `_unmapped: true` flag (transient, stripped before save).

Pattern (concrete placement during implementation depends on the file's structure):

```tsx
// after `parsed = await aiParse(text)`
const inventoryNames = new Set(
  inventoryItems
    .filter((inv: any) => inv.administrationGroup)
    .map((inv: any) => inv.name)
);
const annotated = parsed.items.map((it: any) => {
  if (it.type === 'medication' && !inventoryNames.has(it.medicationRef)) {
    return { ...it, _unmapped: true };
  }
  return it;
});
```

- [ ] **Step 3: In `MedicationEditor`**, when rendering an item with `_unmapped: true`, show an inline alert with a "Configure" button that opens the `MedicationConfigDialog`. Pattern at the top of the editor's return JSX:

```tsx
{(item as any)._unmapped && (
  <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2 flex items-center justify-between">
    <span>
      {t('postopOrders.editor.unmappedMedication',
        '"{{name}}" is not configured for the swimlane.',
        { name: item.medicationRef })}
    </span>
    <Button size="sm" variant="outline" onClick={() => setConfigOpen(true)}>
      {t('postopOrders.editor.configure', 'Configure')}
    </Button>
  </div>
)}
```

- [ ] **Step 4: Strip `_unmapped` before save.** In the editor dialog's save handler (or wherever the items are sent to the server), filter the flag:

```tsx
const cleanItems = items.map(({ _unmapped, ...rest }: any) => rest);
```

- [ ] **Step 5: Add i18n keys.** EN:

```json
      "unmappedMedication": "\"{{name}}\" is not configured for the swimlane.",
      "configure": "Configure"
```

DE:

```json
      "unmappedMedication": "\"{{name}}\" ist nicht für den Verlauf konfiguriert.",
      "configure": "Konfigurieren"
```

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/anesthesia/postop/AiPasteOrders.tsx client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(postop-orders): AI parser flags unmapped meds with inline Configure CTA"
```

---

### Task B5: Soft-display existing legacy `medicationRef` strings

**Files:**
- Modify: `client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx`

- [ ] **Step 1: Apply the same "unmapped" treatment** to existing items loaded from the server whose `medicationRef` does not match a configured medication. Compute the unmapped flag at render time inside the editor:

```tsx
const isConfigured = useMemo(
  () => dedupedItems.some((inv: any) => inv.name === item.medicationRef),
  [dedupedItems, item.medicationRef]
);
const showUnmapped = !!item.medicationRef && !isConfigured;
```

- [ ] **Step 2: Update the inline alert** from Task B4 to render when EITHER `_unmapped` OR `showUnmapped` is true:

```tsx
{((item as any)._unmapped || showUnmapped) && (
  <div className="text-xs text-amber-500 ..."> ... </div>
)}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 4: Manual smoke test.** Save a hand-crafted order set in the DB (or via a previous version) with a free-text `medicationRef`. Reload — the editor should render the row with a yellow alert and a Configure button. The save handler should reject until either the medication is configured or the row removed.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/anesthesia/postop/itemEditors/MedicationEditor.tsx
git commit -m "feat(postop-orders): soft-display unmapped legacy medicationRef strings"
```

---

## Phase C — Swimlane rendering

> **Important:** Phase C touches `client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx` (1717 lines) and the timeline context that feeds it (`activeSwimlanes` from `useTimelineContext`). The existing top-strip lives at lines 642-700 of MedicationsSwimlane. The row inventory is driven by the timeline context's `activeSwimlanes` array. Verify the exact integration points by reading the file before editing — the line numbers in this plan are based on the current file at spec-writing time and may have drifted.

### Task C1: Two-line label + `Verordnet`/`Ordered` tag

**Files:**
- Modify: `client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx`
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Identify the medication row label cell** in `MedicationsSwimlane.tsx`. Search for where each `lane` (inside `activeSwimlanes.flatMap`) renders its left-side label. The component renders multiple `flatMap` blocks (lines 710, 768, 909) — find the one that renders the label cell (typically the first or second block).

- [ ] **Step 2: Determine which props supply the order set context.** The component receives `plannedMedEvents` (line 447) and `prnItems` (line 457). It does NOT currently receive the order set items themselves. Add a new prop:

```tsx
orderedMedicationRefs?: Set<string>;  // names of medications referenced by the active order set
```

Plumb this prop from the parent (`UnifiedTimeline.tsx` → `MedicationsSwimlane`) by deriving it from `postopOrderSet.data?.orderSet.items`:

```tsx
// in the parent component's render
const orderedMedicationRefs = useMemo(
  () => new Set(
    (postopOrderSet.data?.orderSet.items ?? [])
      .filter((it: any) => it.type === 'medication' && typeof it.medicationRef === 'string')
      .map((it: any) => it.medicationRef as string)
  ),
  [postopOrderSet.data?.orderSet.items]
);

// pass to <MedicationsSwimlane orderedMedicationRefs={orderedMedicationRefs} ... />
```

- [ ] **Step 3: Update the medication-row label rendering** to two lines with optional `Verordnet` tag. Concrete shape (apply at the label cell location):

```tsx
<div className="flex flex-col justify-center px-3 py-1 gap-0.5">
  <div className="text-sm font-medium truncate" title={lane.label}>
    {lane.drugName ?? lane.label}  {/* drug name */}
  </div>
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
    {lane.unit && <span>({lane.unit})</span>}
    {orderedMedicationRefs?.has(lane.drugName ?? lane.label) && (
      <span
        className="bg-blue-500/20 text-blue-300 text-[9px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5"
        data-testid={`medication-row-ordered-${lane.id}`}
      >
        {t('postopOrders.swimlane.ordered', 'Ordered')}
      </span>
    )}
  </div>
</div>
```

(`lane.drugName` and `lane.unit` may have different actual field names — adjust to the real shape of the swimlane lane object during implementation.)

- [ ] **Step 4: Adjust the row height** in the swimlane positioning logic from 44 to 56 (or whatever constant currently lives in the timeline context). Search for where medication row heights are computed.

- [ ] **Step 5: Add i18n keys.** EN under `postopOrders`:

```json
    "swimlane": {
      "ordered": "Ordered"
    }
```

DE:

```json
    "swimlane": {
      "ordered": "Verordnet"
    }
```

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 7: Manual smoke test.** Open a case with a saved order set referencing one configured medication. Verify the row label has two lines and the "Verordnet" tag appears. Other medication rows (administered intra-op but not ordered) should not have the tag.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx client/src/components/anesthesia/UnifiedTimeline.tsx client/src/pages/anesthesia/Op.tsx client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(postop-orders): two-line medication row label with Verordnet tag"
```

---

### Task C2: Per-row planned pills

**Files:**
- Modify: `client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx`

- [ ] **Step 1: Locate the existing top-strip planned-pills logic** (lines 642-700). The `plannedPills` `useMemo` computes positions for all events. The strip render starts around line 665.

- [ ] **Step 2: Add a per-row variant.** Compute `plannedPillsByMedication`: a map keyed by `medicationRef` string → array of `{ ev, classification, leftCalc }`. Use `classifyPlannedMedEvent` (already imported, used at line 655):

```tsx
const plannedPillsByMedication = useMemo(() => {
  if (!plannedMedEvents) return new Map<string, Array<{
    ev: NonNullable<typeof plannedMedEvents>[number];
    classification: ReturnType<typeof classifyPlannedMedEvent>;
    leftFraction: number;
  }>>();
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = Math.max(1, visibleEnd - visibleStart);
  const nowMs = Date.now();

  const map = new Map<string, Array<any>>();
  for (const ev of plannedMedEvents) {
    if (ev.plannedAt < visibleStart || ev.plannedAt > visibleEnd) continue;
    const classification = classifyPlannedMedEvent({ plannedAt: ev.plannedAt, status: ev.status }, nowMs);
    const leftFraction = (ev.plannedAt - visibleStart) / visibleRange;
    const key = ev.medicationRef;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ ev, classification, leftFraction });
  }
  return map;
}, [plannedMedEvents, currentZoomStart, currentZoomEnd, data.startTime, data.endTime]);
```

- [ ] **Step 3: Render per-row pills inside each medication row's track.** Find the block that renders bolus/admin pills inside a medication lane (probably one of the `flatMap` blocks at 710/768/909). Add a sibling render for planned pills:

```tsx
{(plannedPillsByMedication.get(lane.drugName ?? lane.label) ?? []).map(({ ev, classification, leftFraction }) => {
  const pillStyle =
    classification === 'done'    ? 'bg-emerald-700 border border-emerald-500 text-emerald-100' :
    classification === 'overdue' ? 'bg-amber-700/60 border border-dashed border-amber-500 text-amber-100' :
                                   'bg-blue-700/40 border border-dashed border-blue-400 text-blue-100';
  return (
    <button
      key={`planned-${ev.id}`}
      type="button"
      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap z-10 ${pillStyle}`}
      style={{ left: `${leftFraction * 100}%` }}
      title={`${ev.medicationRef} ${ev.dose} — ${new Date(ev.plannedAt).toLocaleTimeString()}`}
      onClick={() => setOpenPlannedEvent(ev)}
      data-testid={`planned-med-pill-${ev.id}`}
    >
      {ev.dose}
    </button>
  );
})}
```

(`setOpenPlannedEvent` is already wired up — reuses the Phase 3 admin dialog at line 1673 area.)

- [ ] **Step 4: Verify color tokens** match the existing palette used elsewhere in the project. If `bg-emerald-700` doesn't fit the theme, swap for the project's existing tokens (e.g. `bg-success`, `bg-destructive`). Same for amber/blue.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 6: Manual smoke test.** Open a case with an active order set, q8h scheduled medication, current time roughly 30 min after surgery end. Verify:
  - Per-row blue dashed pills appear at planned times in the future
  - The pill due now (or just past) appears in amber
  - Pills already administered remain green (existing behavior)
  - Clicking a planned pill opens the administer dialog

- [ ] **Step 7: Commit**

```bash
git add client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx
git commit -m "feat(postop-orders): per-row planned-dose pills inside medication tracks"
```

---

### Task C3: Top-strip becomes alerts-only

**Files:**
- Modify: `client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx`

- [ ] **Step 1: Update the existing `plannedPills` `useMemo`** (lines 642-660) to filter to overdue + due-now classifications only:

Replace the existing `plannedPills` filter:

```tsx
const plannedPills = useMemo(() => {
  if (!plannedMedEvents) return [];
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = Math.max(1, visibleEnd - visibleStart);
  const nowMs = Date.now();

  return plannedMedEvents
    .filter(ev => ev.plannedAt >= visibleStart && ev.plannedAt <= visibleEnd)
    .map(ev => {
      const classification = classifyPlannedMedEvent({ plannedAt: ev.plannedAt, status: ev.status }, nowMs);
      const xFraction = (ev.plannedAt - visibleStart) / visibleRange;
      return { ev, classification, leftCalc: xFraction };
    })
    .filter(({ classification }) => classification === 'overdue' || classification === 'due_now');
}, [plannedMedEvents, currentZoomStart, currentZoomEnd, data.startTime, data.endTime]);
```

(Confirm the exact string used by `classifyPlannedMedEvent` for "due now" — it might be `'due_now'`, `'due'`, or similar. Read `shared/postopMedicationExecution.ts` to confirm.)

- [ ] **Step 2: Make the strip collapse when empty.** Find the strip render block (line 665-ish, starting with `{plannedPills.length > 0 && (() => {`). The existing IIFE already returns nothing when `plannedPills.length === 0` — verify this still holds after the filter narrows the list. No code change unless the strip has a fixed-height container that should disappear.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 4: Manual smoke test.** With a case that has only future-planned doses (no overdue), the top strip should NOT render. Force a state where one dose is overdue → top strip should appear with one pill in that strip.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/anesthesia/swimlanes/MedicationsSwimlane.tsx
git commit -m "feat(postop-orders): top-strip narrows to overdue + due-now alerts only"
```

---

### Task C4: Auto-row creation for ordered medications

**Files:**
- Modify: timeline context provider (find by searching for `useTimelineContext` provider in `client/src/components/anesthesia/`)
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

- [ ] **Step 1: Locate the `activeSwimlanes` source.** Search the codebase:

```bash
grep -rn "activeSwimlanes\|swimlanes:" client/src/components/anesthesia/ | grep -v ".test." | grep -v "node_modules" | head
```

Read the file that defines `activeSwimlanes` (likely a Provider component or a hook).

- [ ] **Step 2: Identify the medication-row driver.** The provider likely builds medication rows from a list of `medicationConfigs` in use (those administered, those always-shown). Find that list and extend it.

- [ ] **Step 3: Compute `orderedMedicationConfigs`.** Resolve each `orderedMedicationRefs` (Set<string>) to its corresponding `medicationConfig` row (by item name):

```tsx
const orderedMedicationConfigs = useMemo(() => {
  const refs = new Set(
    (postopOrderSet.data?.orderSet.items ?? [])
      .filter((it: any) => it.type === 'medication' && typeof it.medicationRef === 'string')
      .map((it: any) => it.medicationRef as string)
  );
  return (allMedicationConfigs ?? []).filter((mc: any) => refs.has(mc.itemName) && mc.administrationGroup);
}, [postopOrderSet.data?.orderSet.items, allMedicationConfigs]);
```

(`allMedicationConfigs` source: there is likely an existing query for medications. Check if there's something like `useQuery(['/api/medication-configs', hospitalId])` already in the timeline context — if not, add one.)

- [ ] **Step 4: Union with existing rows.** Where `activeSwimlanes` (or the medication group's row list) is built, add ordered configs that aren't already present:

```tsx
const allMedicationRows = useMemo(() => {
  const seen = new Set(existingMedicationRows.map((r: any) => r.id));
  const extra = orderedMedicationConfigs
    .filter((mc: any) => !seen.has(mc.id))
    .map((mc: any) => buildSwimlaneRowFromMedicationConfig(mc));
  return [...existingMedicationRows, ...extra];
}, [existingMedicationRows, orderedMedicationConfigs]);
```

(`buildSwimlaneRowFromMedicationConfig` is whatever helper currently constructs a swimlane row from a medication config — find and reuse. If none exists, mirror the existing pattern by cloning what an admin-driven row looks like.)

- [ ] **Step 5: Group placement.** Each ordered row inserts under its `administrationGroup` group (BOLUS, INFUSIONS, ANTIBIOTICS, etc.). The grouping logic likely already keys on `administrationGroup` — adding rows to the same array should bucket correctly. Verify by inspecting how the existing rows are grouped.

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: pass.

- [ ] **Step 7: Manual smoke test.** Order Amoxicillin (configure it first if needed) on a case that has ZERO intraop antibiotic administrations. Reload the case. Verify:
  - The ANTIBIOTICS group expands to show an Amoxicillin row
  - The row has the "Verordnet" tag
  - Per-row planned pills appear at scheduled times
  - The top-strip stays empty (no overdue yet)

- [ ] **Step 8: Commit**

```bash
git add client/src/components/anesthesia/<context-file>.tsx client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "feat(postop-orders): auto-create swimlane rows for ordered medications"
```

---

### Task C5: Component test for the swimlane integration

**Files:**
- Create: `tests/client/medicationsSwimlane.postopOrders.test.tsx`

This is a higher-fidelity test that asserts the integration. May require mocking the timeline context. If the test setup is too involved, replace with two smaller unit tests at the helper level (e.g. test `plannedPillsByMedication` map construction in isolation).

- [ ] **Step 1: Write a minimal render test** that:
  - Renders `MedicationsSwimlane` with a hand-built `activeSwimlanes` (one antibiotic row), `plannedMedEvents` (3 events: 1 done, 1 overdue, 1 future), and `orderedMedicationRefs = new Set(['Amoxicillin/Clavulanic acid'])`.
  - Asserts: row label includes "Verordnet" / "Ordered"; one element with `data-testid="planned-med-pill-..."` appears for each of the 3 events; top-strip element only renders the overdue one.

If wiring up `useTimelineContext` is too heavy, test the pure helper extracted from Task C2 instead:

```ts
// In a small util file, extract:
export function bucketPlannedPillsByMedication(events, visibleStart, visibleEnd, nowMs) { ... }
```

Then unit-test that helper.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/client/medicationsSwimlane.postopOrders.test.tsx`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add tests/client/medicationsSwimlane.postopOrders.test.tsx
git commit -m "test(postop-orders): swimlane planned pills + Verordnet tag rendering"
```

---

## Final verification

### Task Z1: Full typecheck + test run

- [ ] **Step 1:**

```bash
npm run check
```

Expected: pass clean.

- [ ] **Step 2:**

```bash
npm test
```

Expected: all tests pass — including the existing `tests/shared/postopOrderPlanning.test.ts`, `tests/shared/postopMedicationExecution.test.ts`, plus the new ones from this plan.

- [ ] **Step 3: Manual end-to-end smoke**

Start dev server. Load a case with no postop orders. Open the order set editor. Verify:
- Picker shows only configured antibiotics (when filtered to "amox")
- Free-text fallback is gone
- "Start at" input visible in Medication, IvFluid, Lab, Task, VitalsMonitoring, BzSlidingScale, WoundCare editors (where applicable per their mode)
- Save with a configured medication → success
- Order set displays in the swimlane with two-line label, "Verordnet" tag, per-row planned pills
- Top strip stays empty when nothing is overdue
- Clicking a future pill opens the administer dialog

### Task Z2: Push branch (do NOT merge)

User-only step. Stop here and confirm with the user before pushing.

---

## Out of scope (explicit reminder)

After this plan ships, the following remain as separate work:

1. **AI parser SYSTEM_PROMPT fix** — `server/services/postopOrderAIParser.ts` documents only 4 of 12 item types (medication, lab, task, free_text). Missing: `vitals_monitoring`, `mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `iv_fluid`, `bz_sliding_scale`. ~30 min of prompt-engineering work.
2. **Outputs migration** — anesthesia PDF (`client/src/lib/anesthesiaRecordPdf.ts`) and discharge brief (`server/utils/dischargeBriefData.ts`) still read only from legacy `postOpData`. Future phase.
3. **Legacy `postOpData` form retirement** — top-level destination/notes/complications + collapsed paracetamol/PONV/ambulatory still in `Op.tsx`. Future phase, depends on outputs migration.
