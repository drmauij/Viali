# Postop Orders — Start Time + Medication Picker Constraint + Swimlane Rendering

**Date:** 2026-05-06
**Status:** Design approved, plan pending
**Phase:** Improvement on Phase 3 (Postop Orders shipped 2026-04-14, last extended 2026-04-18)

## Background

The postop order-set system (Phases 1, 2, 2.1, 3 — all merged to main) is functional and in production use. Three concrete gaps surface during real clinical use:

1. **No start time on order items.** Editors don't expose a "Start at" field, so all planned events default to "immediately" (now). Some types (Medication, IvFluid) have an unused `startAt` field in the schema; others use mode-specific fields (`Task.oneShotAt`, `Lab.oneShotOffsetH`); several have no concept of timing at all.
2. **Medication picker accepts un-renderable orders.** The medication picker in `MedicationEditor.tsx` lets the user (a) pick inventory items that have no swimlane configuration (`administrationGroup` unset) or (b) type free text via the "Add as free text" button. Either way, the resulting order has no swimlane row — the planned doses are invisible to clinicians at the bedside.
3. **Per-row swimlane rendering for ordered medications.** The Phase 3 planned-pill strip lives at the top of the medications swimlane, decoupled from the per-medication rows. There is no per-row visual signal that "this medication was placed by an order" and no per-row planned pills.

Out of scope for this design:

- Migrating the anesthesia PDF / discharge brief outputs to read from the order set (still read legacy `postOpData`)
- Migrating the legacy `postOpData` form fields (destination, notes, complications, PONV, ambulatory)
- Adding new item types
- AI parser fix for `postopOrderAIParser.ts` SYSTEM_PROMPT (4 of 12 types documented) — tracked as a separate ~30 min follow-up

## Decisions (locked in)

- Picker constraint: **hard block** — only medications with `administrationGroup` set are listable; free-text removed; gear icon stays as the inline configure path
- Swimlane row treatment: **`Verordnet` tag (DE) / `Ordered` (EN) appended after the medication name**
- Label layout: **uniform two-line label** for all medication rows — drug name on top, route/dose unit + tag below
- Pill colors: keep existing **green solid (administered) / amber dashed (overdue) / blue dashed (upcoming)** convention from Phase 1/3
- Top strip: **alerts-only** — overdue + due-now only; future events live exclusively on the per-row pills

## 1. Start time on order items

### Schema (additive, no DB migration)

Add `startAt?: string` (ISO 8601 datetime) to every item type that produces planned events. Existing fields are kept for back-compat:

| Type | Today | After |
|---|---|---|
| `MedicationItem` (scheduled) | `startAt` exists, not exposed | expose `startAt` |
| `IvFluidItem` | `startAt` exists, not exposed | expose `startAt` |
| `LabItem` | `oneShotOffsetH` (relative, one-shot only) | add `startAt`; keep legacy field |
| `TaskItem` | `oneShotAt` (one-shot only) | add `startAt`; keep legacy field |
| `VitalsMonitoringItem` | nothing | add `startAt` |
| `BzSlidingScaleItem` | nothing | add `startAt` |
| `WoundCareItem` (`every_n_days`) | nothing | add `startAt` |

Items that describe states, not scheduled events, are not touched: `MobilizationItem` (already has `assistedFrom` for the assisted sub-mode), `PositioningItem`, `DrainItem`, `NutritionItem` (already has `startAfter` text label), `FreeTextItem`.

### Editor UX

A `<input type="datetime-local">` labeled "Start at" / "Beginn um" rendered inline in each editor (positioned next to "Frequency" or "Mode" depending on the type).

- Use the existing `dateTimeLocalToISO` helper from `client/src/lib/dateUtils.ts` for parsing — never raw `new Date(value)` (CLAUDE.md datetime/timezone rule).
- Default value is empty (interpreted by planning logic as `now()`). No pre-filled future timestamp; clinicians explicitly choose a delay only when they want one.

### Planning logic (`shared/postopOrderPlanning.ts`)

First-event timestamp resolution:

```
firstEventAt = startAt ?? legacyField ?? now()
```

Where `legacyField` is the type-specific existing field (`oneShotAt`, `oneShotOffsetH * 60min`, etc.). For recurring schedules (Medication q8h, Task daily), subsequent events are computed forward from the first event's time. The recurrence math itself is unchanged.

## 2. Medication picker constraint

### Editor (`MedicationEditor.tsx`)

- Filter the inventory query (`/api/items/${hospital?.id}?unitId=${hospital?.unitId}`) result to include only items where `administrationGroup` is set. Implementation detail: verify whether the existing endpoint exposes `administrationGroup` directly, or whether we need a different endpoint or extra join.
- **Remove** both "Add as free text" code paths (lines 137-143 in the empty state and lines 165-173 in the search-results group).
- **Empty search state** copy: "No matching medication — click the gear icon to configure a new one."
- **Empty hospital state** (no configured medications anywhere): inline message + a "Configure your first medication" CTA button that opens the gear dialog (`MedicationConfigDialog`) directly.

### Server backstop (`server/routes/anesthesia/postopOrders.ts`)

The save handler validates each `MedicationItem.medicationRef` against the configured medication catalog (must resolve to a medication with `administrationGroup` set). Reject the save with a 400 if any medication item is unresolved. Picker enforces it client-side; the server enforces it again so a stale or malicious client cannot create un-renderable orders.

### AI paste-orders (`AiPasteOrders.tsx`)

Post-validate the AI's parsed items. Any medication whose `medicationRef` doesn't resolve to a configured catalog entry is surfaced inline in the editor with an "Unrecognized: '<name>' — Configure or remove" row and a button that opens the gear dialog pre-filled with the unrecognized name. We don't rework the SYSTEM_PROMPT here — that's tracked separately as the AI parser fix.

### Legacy data

Existing order sets in production may already contain `medicationRef` strings that don't map to a configured medication (free-text leftovers or stale entries). The editor must render them as soft "Unrecognized" rows (not crash, not auto-clear). User picks a configured replacement or removes the row explicitly. Clinical orders never silently disappear.

## 3. Swimlane rendering for ordered medications

All changes inside `MedicationsSwimlane.tsx` (1717 lines today — biggest concentration of work).

### 3a. Row inventory: auto-create rows for ordered medications

Today's row list ≈ medications with administered doses + always-show medications. Extend to a union:

```
visibleRows = unique(
  administeredMeds ∪ alwaysShowMeds ∪ orderedMeds
)
```

Each row groups under the medication's `administrationGroup`. Ordering Amoxicillin (group: antibiotics) makes the ANTIBIOTICS group's row list grow by one — even with zero administrations yet.

### 3b. Per-row planned pills

Today (lines ~642-700) `plannedPills` are computed once and rendered in a single strip across the **top** of the swimlane. New shape: planned pills are computed **per row**, each medication's planned events filtered by `medicationRef` matching the row's catalog entry, rendered absolutely-positioned inside the row's track at their `plannedAt` timestamps.

Existing color convention is preserved per-row:

- `green solid` = administered (existing per-row admin pill)
- `blue dashed` = upcoming (new per-row)
- `amber dashed` = overdue (new per-row)

Click target reuses the existing `setOpenPlannedEvent` handler → `PostopAdministerDialog` (already in place from Phase 3). No new dialog.

### 3c. Top strip becomes alerts-only

The existing top-strip filter changes from "all planned events" to "planned events where classification ∈ {overdue, due_now}". Future events (blue dashed) drop out of the top strip — they live only in their per-row position. Done events also drop out (the row already shows them as green pills).

If the filtered list is empty, the strip collapses entirely (no fixed-height empty bar).

### 3d. Two-line label with `Verordnet` tag

Label cell layout for medication rows changes from a single line to two lines:

```
┌─────────────────────────────┐
│ Amoxicillin/Clavulanic acid │  ← line 1: drug name (font-medium)
│ (mg, p.o.)  [Verordnet]     │  ← line 2: dose unit + tag (smaller, muted)
└─────────────────────────────┘
```

Row height bumps from 44px to ~56px uniformly across all medication rows.

The `Verordnet` tag renders only on rows where at least one `medication`-type item in the active order set references this medication. Boolean derivation from props.

i18n key: `postopOrders.swimlane.ordered` — EN: `"Ordered"`, DE: `"Verordnet"`.

### 3e. Edge cases

- **Same medication in multiple order items** (scheduled q8h + PRN): one `Verordnet` tag (boolean — referenced or not). Scheduled doses render as per-row planned pills; PRN options continue to render in the existing bottom PRN strip.
- **Ordered med also administered intra-op**: existing per-row admin pills (green solid) coexist with new per-row planned pills (blue/amber dashed) at their respective timestamps.

## File inventory

Schema + planning (shared):

- `shared/postopOrderItems.ts` — add `startAt?: string` to Lab/Task/VitalsMonitoring/BzSlidingScale/WoundCare items
- `shared/postopOrderPlanning.ts` — first-event resolution honors `startAt`, falls back to legacy fields

Editors (datetime-local input each):

- `MedicationEditor.tsx` — also: filter to configured meds, remove free-text, empty-hospital CTA
- `IvFluidEditor.tsx`, `LabEditor.tsx`, `TaskEditor.tsx`, `VitalsMonitoringEditor.tsx`, `BzSlidingScaleEditor.tsx`, `WoundCareEditor.tsx`

AI editor:

- `AiPasteOrders.tsx` — post-validate AI output, surface unmapped meds with inline Configure button

Swimlane:

- `MedicationsSwimlane.tsx` — row union, per-row planned pills, alerts-only top strip, two-line label, `Verordnet` tag

Server:

- `server/routes/anesthesia/postopOrders.ts` — reject unconfigured `medicationRef` at save

i18n (EN + DE):

- `postopOrders.editor.startAt`
- `postopOrders.swimlane.ordered`
- Empty-state copy for the medication picker
- "Unrecognized" copy for legacy / unmapped medication rows

Tests:

- Extend `tests/shared/postopOrderPlanning.test.ts` for `startAt` resolution
- New component test: swimlane renders auto-created row + Verordnet tag + per-row pills + alerts-only top strip

## Rollout

- No feature flag, no DB migration. Pure additive on JSONB types and UI logic.
- Existing items without `startAt` keep working via fallback resolution.
- Legacy unrecognized `medicationRef` strings render as soft rows, not crashes.
- Top-strip filter change is the only "removal"; <30 days past Phase 3 ship, so habit hasn't entrenched.
- Rollback path is a single revert.

## Definition of done

- Editors expose `startAt` for all schedulable item types; planning logic honors it
- Picker filters to configured medications; free-text path removed; empty states copied
- Server rejects unconfigured `medicationRef` at save with a clear error
- AI parser post-validates and surfaces unmapped meds inline
- Swimlane: ordered meds appear as auto-created rows with two-line label + `Verordnet` tag; per-row planned pills at scheduled times; top strip alerts-only
- Existing `postop_planned_events` keep working through fallback fields
- i18n EN + DE complete
- Tests added/extended

## Follow-up (separate ticket)

`server/services/postopOrderAIParser.ts` SYSTEM_PROMPT documents only 4 of 12 item types. Missing: `vitals_monitoring`, `mobilization`, `positioning`, `drain`, `nutrition`, `wound_care`, `iv_fluid`, `bz_sliding_scale`. ~30 min of prompt-engineering work. Not part of this spec.
