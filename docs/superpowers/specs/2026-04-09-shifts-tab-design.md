# Shifts Tab — Design

**Date:** 2026-04-09
**Status:** Draft, pending review

## Summary

Add a new top-level **Shifts** tab (sibling to Appointments) where clinic staff is rostered into configurable shift types per day. Shift types are hospital-level reference data configured in Clinic Settings. Assignments are decoupled from the existing saal-plan so clinics can use shifts only, saal only, both together, or assign shifts to staff that aren't in saal at all (e.g. on-call, PACU). A second entry point in the OP calendar's planned-staff detail dialog lets you set a person's shift for that day without leaving the OP workflow.

No changes to the Appointments tab, the OP calendar layout, or existing saal-plan behavior.

## Motivation

The existing saal-plan toggle answers only "is this person in the OR room today". Real clinics need to express *which shift pattern* a person is on (Early 07–15, Late 08–17, Night 14–22, On-call, …), and some of that rostering applies to people who aren't physically in the OR (PACU, on-call doctors). Overloading the appointments calendar with shift info clutters a view that's already dense. A dedicated lens keeps each concept clean: appointments for patient flow, shifts for staff planning.

## Scope

**In scope:**
- `shift_types` and `staff_shifts` tables with idempotent migration
- CRUD endpoints for both
- New "Shift Types" tab in Clinic Settings
- New top-level **Shifts** tab with Week and Month views
- Extended staff-cell popover (role + shift pickers, both independent)
- New "Shift" field inside the OP calendar's planned-staff detail dialog
- Reuse of the existing absence/time-off visual treatment (same colors, same partial indicators, same tooltips) on the Shifts views, including a warning banner in the popover when assigning onto an absent day

**Out of scope (deferred):**
- A "shift-able" flag to roster non-bookable users (nurses, assistants) — starts with `bookableProviders` only
- Multiple shifts per person per day (handled today by creating combined shift types like "Early+OnCall")
- Cross-unit god-view of all shifts
- Shift templates / recurring shift patterns
- Copying a week's shifts to the next week
- Reporting / shift totals

## Data Model

### `shift_types`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `hospitalId` | text | FK → `hospitals.id`, NOT NULL |
| `unitId` | text \| null | FK → `units.id`, nullable — null = available to all units |
| `name` | text | e.g. "Frühdienst" |
| `code` | text | short label (1–4 chars), e.g. "E" |
| `icon` | text \| null | lucide icon name, optional |
| `color` | text | hex color, e.g. `#3b82f6` |
| `startTime` | text | "HH:MM" |
| `endTime` | text | "HH:MM" |
| `sortOrder` | integer | display order in pickers |
| `createdAt` / `updatedAt` | timestamp | standard |

Indexes: `(hospitalId, sortOrder)`, `(hospitalId, unitId)`.

### `staff_shifts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `hospitalId` | text | FK → `hospitals.id`, NOT NULL |
| `userId` | text | FK → `users.id`, NOT NULL |
| `date` | date | NOT NULL |
| `shiftTypeId` | uuid | FK → `shift_types.id`, NOT NULL |
| `createdBy` | text | FK → `users.id`, nullable |
| `createdAt` / `updatedAt` | timestamp | standard |

**UNIQUE** `(hospitalId, userId, date)` — enforces one shift per person per day. Assignment updates overwrite the existing row (upsert).

Deletion of a shift type is **restricted** if any `staff_shifts` row references it — admin must reassign or clear first. (Alternative: soft-delete with `archivedAt`. We'll start with restrict and revisit if it's painful.)

### Decoupling from `staff_pool`

No FK, no cascade, no implicit coupling. Assigning a shift never touches `staff_pool`; removing someone from `staff_pool` never touches their shifts. The Shifts tab popover can set saal-plan role and shift independently in the same save, but they write to two separate tables in one transaction.

## Backend

### Endpoints

- `GET    /api/shift-types/:hospitalId` — list all shift types for a hospital (used by Shifts tab picker and Settings page)
- `POST   /api/shift-types/:hospitalId` — create (admin only)
- `PATCH  /api/shift-types/:id` — update (admin only)
- `DELETE /api/shift-types/:id` — delete, 409 if referenced by any `staff_shifts` (admin only)
- `GET    /api/staff-shifts/:hospitalId?from=YYYY-MM-DD&to=YYYY-MM-DD&unitId=...` — range query for a calendar view; filters by unit-scoped providers
- `POST   /api/staff-shifts/:hospitalId` — upsert a single shift assignment `{userId, date, shiftTypeId}`
- `POST   /api/staff-shifts/:hospitalId/bulk` — upsert multiple shift assignments (drag-select bulk path)
- `DELETE /api/staff-shifts/:id` — clear one shift assignment
- `DELETE /api/staff-shifts/:hospitalId/bulk` — clear multiple `{userId, date}` pairs
- `POST   /api/staff-shifts/:hospitalId/assign` — **combined atomic endpoint** used by the Shifts tab popover. Body: `{userId, date, role?: StaffRole | null, shiftTypeId?: uuid | null}`. In one DB transaction, upserts/removes the `staff_pool` row for that `(userId, date)` based on `role`, and upserts/removes the `staff_shifts` row based on `shiftTypeId`. A `bulk` variant accepts `[{userId, date, role?, shiftTypeId?}]` for drag-select.

### Permissions

- **Read** (`GET` endpoints): any authenticated user with access to the hospital.
- **Write** (`POST`/`PATCH`/`DELETE`): admin or manager role on the hospital (same gate as `requireWriteAccess` used elsewhere).

### Migration

Idempotent SQL in a new `migrations/NNNN_shifts.sql`:
- `CREATE TABLE IF NOT EXISTS shift_types (...)`
- `CREATE TABLE IF NOT EXISTS staff_shifts (...)`
- `CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_hospital_user_date_uidx ON staff_shifts (hospital_id, user_id, date)`
- FK constraints wrapped in `DO $$ ... IF NOT EXISTS ... END $$` per project convention
- Timestamps in `_journal.json` must be greater than all previous entries

## Frontend

### New Route and Tab

- Route: `/shifts`
- Nav entry immediately after "Appointments" (same bottom-tab bar on mobile, same sidebar on desktop)
- Icon: `CalendarClock` or `Users` from lucide (pick in implementation)
- Label: `shifts.tabLabel` — translated "Shifts" / "Schichten"

### Page Layout

- Top bar: date navigator (`←`, Today, `→`, current period label) — identical styling to Appointments
- View switcher: **Day** / **Week** / **Month**
- Filter button (independent state from Appointments Filter dialog — new sessionStorage key)
- Unit is inherited from the app header unit context, same as Appointments

### Views

**Day view** (`ShiftsDayView`):
- Provider lanes with an hourly time axis — same structural pattern as `AppointmentsDayView`
- Each lane renders two kinds of blocks:
  1. **Unavailability blocks** — `providerAbsences` and `providerTimeOff` entries drawn as colored/striped blocks over their actual time range (full-day absences fill the lane; partial time-offs occupy only their hours)
  2. **Shift block** — the assigned shift drawn as a colored block over its `startTime`–`endTime`, on top of / next to the unavailability
- Clicking an empty area in a lane → popover opens with the day's time-off info block and the shift picker, so the admin can see *visually* that the shift doesn't overlap the unavailable hours before committing
- This is the primary view for the "half-day time-off + assign a non-overlapping shift" workflow
- Read-only for non-admins (no click handler)

**Week view** (`ShiftsWeekView`):
- Grid: provider rows × 7 day columns
- Header identical to `AppointmentsWeekView` (date labels, today highlight)
- Rows: `bookableProviders` filtered by current unit, matching the same query Appointments uses
- Each cell: renders one `ShiftCell` component — empty or a shift chip
- Drag-select across days in the same row: enabled — opens popover once, applies to all selected days

**Month view** (`ShiftsMonthView`):
- Grid: provider rows × Mon–Fri columns with week separators (same pattern as `AppointmentsMonthView`)
- Smaller chip (code + color swatch, no time range)
- Same click + drag-select behavior

Implementation note: these should be **new dedicated components**, not mode-flags injected into `AppointmentsWeekView` / `AppointmentsMonthView`. Both pairs are independent and evolve at their own pace. They may share small helpers (date range utils, drag-select logic) via extraction into a shared module if duplication becomes real.

### Shift Cell Component

Props: `shift | null`, `isAbsent`, `onClick`, `disabled`.
- Empty and not absent → empty cell with hover affordance
- Empty and absent → faint grey background, small absence icon, still clickable (admin can override)
- Filled → colored rounded chip: `icon · code · name · startTime–endTime` (week) or `icon · code` (month)
- Background color = shift color with white text, fallback to tailwind contrast
- Read-only mode (non-admin): no hover affordance, no click handler

### Staff Shift Popover

A **new** component `StaffShiftPopover`. It is **not** a modification of the existing `SaalStaffPopover` — that one stays wired into the Appointments views exactly as it is today. The new component is used in:
- Shifts tab cell click
- OP calendar planned-staff detail dialog (as an embedded section, not a popover there)

**Top section — Time-off / Absence awareness (conditional):**
If the target `(userId, date)` has any `providerAbsence` or `providerTimeOff` record overlapping it, the popover renders an info block at the top showing type, date range, partial-time range, reason, approval status, and creator. The block is passive — it never blocks the save — but it makes the conflict unmissable. Individual shift types in the dropdown below that **time-overlap** the unavailability window are marked with a warning icon (partial time-off scenario). Full-day absences mark the whole dropdown with a subtle warning tint but still allow selection.

Fields:
- **Role** (saal-plan role) — dropdown, optional, clearable. Sets/clears presence in `staff_pool`.
- **Shift** — dropdown listing shift types where `unitId IS NULL OR unitId = currentUnit`, ordered by `sortOrder`. Optional, clearable. Sets/clears row in `staff_shifts`.
- **Save** button — writes both changes atomically. To guarantee atomicity, the spec adds a combined endpoint `POST /api/staff-shifts/:hospitalId/assign` that takes `{userId, date, role?, shiftTypeId?}` and performs both `staff_pool` and `staff_shifts` writes inside a single DB transaction.
- **Clear all** button — calls the same endpoint with both fields null.

Both fields show their current value pre-filled. Clearing a field and saving removes the corresponding row.

There's no coupling between the two fields — a shift without a role is valid (e.g. PACU/on-call), and a role without a shift is also valid (existing behavior).

### Bulk Assign Flow (Drag-Select)

1. User presses and drags across multiple cells in the same row
2. On mouseup, popover opens once
3. Save → bulk endpoint applies the same role/shift to all selected `(userId, date)` pairs
4. Optimistic UI update on the grid

### Settings Page

New tab in **Clinic Settings**: **Shift Types**.

Table with columns: color swatch, icon, name, code, time range, unit (or "all"), sort order, actions (edit, delete).
"+ Add shift type" button → modal with form:
- Name (required)
- Code (required, max 4 chars)
- Icon (optional, lucide picker component — restrict to a curated subset like `Sun`, `Moon`, `SunMoon`, `Phone`, `Bed`, `Stethoscope`, `Clock`, 10-ish icons)
- Color (required, color picker component)
- Start time (required, HH:MM)
- End time (required, HH:MM, must be different from start)
- Unit (optional, dropdown of hospital units + "All units")
- Sort order (number input, default appended last)

Delete confirmation shows assignment count ("This shift type is used in 47 assignments"). Block deletion if any, pointing the user to replace or clear first.

### OP Calendar Planned-Staff Detail Dialog

Adds a new "Shift" section under the existing role/unit info. Contents = the same shift dropdown + clear option used in the Shifts tab popover. Saving the detail dialog upserts into `staff_shifts` for that `(user, date)` pair.

No other changes to the OP calendar.

## Permissions Matrix

| Action | Anyone | Admin/Manager |
|---|---|---|
| View Shifts tab | ✓ | ✓ |
| View shift types in Settings | ✓ (read-only) | ✓ |
| Create/edit shift types | ✗ | ✓ |
| Assign/clear shifts | ✗ | ✓ |
| See OP calendar shift field | ✓ (read-only) | ✓ |

## Filter & Scoping

- Shifts tab inherits the app's **current unit** from the header (same as Appointments)
- Shift types picker is filtered by `unitId IS NULL OR unitId = currentUnit`
- Provider rows come from the existing bookable-providers query scoped by current unit
- Filter dialog (provider multi-select) is **independent** from Appointments — new sessionStorage key `shifts_filter_providers`
- View preference (Week vs Month) persisted in sessionStorage key `shifts_view`

## Absences and Time-Off

The Shifts tab **reuses the exact same visual treatment the Appointments Week and Month views already apply** to absences and time-off, so the user never has to learn a second vocabulary and can never accidentally roster a shift onto someone who's unavailable.

Specifically:

- **Full-day absences** (`providerAbsences` / approved `providerTimeOff`) render with the same colored background + pattern per absence type used today in `AppointmentsWeekView` / `AppointmentsMonthView` (e.g. vacation = one color, sickness = another, generic time-off = another). Same `ABSENCE_COLORS` map, same dashed border for pending time-off, same styling for full vs partial.
- **Partial-day time-off** renders with the same partial indicator (diagonal stripe or corner flag) the Appointments views use.
- The absence label/tooltip on hover is identical.
- **Interaction:** an absence cell is **still clickable** (admin override for last-minute coverage). When the popover opens on an absence/time-off day, it renders a **Time-off / Absence info block** at the top of the popover, showing concrete details:
  - The absence type (vacation, sickness, generic time-off) with its icon and color
  - The date range (e.g. "13–17 Apr 2026") so you see whether this is a single day or part of a longer span
  - The time range if it's a partial-day time-off (e.g. "Partial: 14:00–18:00")
  - The free-text reason/notes if present
  - The approval status for `providerTimeOff` (approved / pending)
  - The creator/approver name if available
  This block is the admin's decision support — they can see "yep, still want to assign the Late shift because Partial time-off only blocks 14–16, and Late starts at 16" — and then choose to assign a matching shift, cancel, or clear the existing assignment. There is no hard block; the info is presented, the admin decides.
- If the popover is opened on a day with a partial time-off, the Shift dropdown can also flag individual shift types that **overlap** the time-off hours with a small warning icon next to the name, so you can tell at a glance which shifts conflict with the unavailability window and which don't.
- If a cell has **both** an absence and an already-assigned shift (manually overridden), both are shown stacked in the grid: absence as the background, shift chip on top.

Implementation: extract the absence-coloring helpers currently inlined in `AppointmentsWeekView` / `AppointmentsMonthView` into a shared utility module (`lib/absenceStyles.ts` or similar) so both the Appointments views and the new Shifts views import the same source of truth. The Shifts views consume the same `providerAbsences` + `providerTimeOff` queries the Appointments tab uses today — no new backend work needed, just a second consumer.

This turns the Shifts tab into a roster you can trust at a glance: "if it's colored differently, don't schedule them".

## Translation Keys

New keys under `shifts.*`:
- `shifts.tabLabel`
- `shifts.weekView`, `shifts.monthView`
- `shifts.pickShift`, `shifts.clearShift`, `shifts.noShiftTypes`
- `shifts.settings.*` for the Settings tab
- `shifts.absenceNote`

## Testing

- API integration tests for `shift_types` and `staff_shifts` CRUD + bulk endpoints
- Unique-constraint enforcement test
- Permission gate tests (non-admin cannot write)
- Delete-with-references returns 409
- Smoke tests for ShiftsWeekView/ShiftsMonthView rendering and cell click
- Popover save/clear roundtrip test

## Implementation Order

1. Migration + `shift_types` and `staff_shifts` tables (schema, idempotent SQL, journal)
2. Backend storage layer + CRUD endpoints + tests
3. Extract absence-coloring helpers from `AppointmentsWeekView` / `AppointmentsMonthView` into shared `lib/absenceStyles.ts` (pure refactor, no behavior change, covered by existing Appointments tests)
4. Settings page: Shift Types tab with full CRUD UI
5. New `StaffShiftPopover` component (shared, includes absence warning banner)
6. Shifts tab route + `ShiftsWeekView` (consumes shared absence helpers)
7. `ShiftsMonthView`
8. `ShiftsDayView` (time-axis view for partial-time-off-aware shift assignment)
9. Drag-select bulk assign (Week + Month)
10. OP calendar planned-staff detail dialog: add Shift section (reuses popover internals)
11. Translation strings (EN + DE)

Each step is committable and verifiable independently.

## Backwards Compatibility

Fully additive. Existing Appointments tab, OP calendar, saal-plan toggle, and `staff_pool` behavior are untouched. The `SaalStaffPopover` currently mounted in Appointments day/week/month views stays exactly as it is today. Nothing breaks if the new tables are empty.

## Open Questions

- **Icon picker scope:** full lucide vs. a curated set of ~10 shift-relevant icons. Recommend curated.
- **Shift-type ordering:** explicit `sortOrder` column vs. alphabetical. Recommend explicit.
- **Combined shifts (e.g. "Early + OnCall"):** handled today by creating a dedicated combined shift type in the list. Revisit if clinics actually need true multi-shift stacking.
- **Bulk paste/copy week:** deferred to v2.
