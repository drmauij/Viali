# Clinic Room Type — Walk-in Tracking

**Date:** 2026-04-09
**Status:** Draft for review

## Problem

When a patient arrives at the clinic on their surgery day, they sit in the entrance/waiting area until a PACU nurse calls them in to start prep. Today there is no signal in Viali that the patient has physically arrived — nurses phone each other to say "patient X is here, ready when you are". This is noise, slows the flow, and has no audit trail.

The information is ephemeral: it only matters from arrival until the patient is moved into a PACU bed. After that, who cares where they were waiting.

## Goals

- Staff can mark "patient X has arrived and is in the waiting area" from the OP-Plan surgery summary card.
- The OP-Plan shows, per surgery card, that the patient is physically present and waiting, in a visually distinct way from PACU-bed status.
- When a PACU bed is subsequently assigned to the patient, the waiting indicator goes away automatically — the two states are sequential, not concurrent.
- Zero nurse phone calls for "patient is here".

## Non-Goals

- No multiple concurrent locations (patient is waiting OR in PACU, never both).
- No "how many waiting right now" summary/filter on OP-Plan. Per-card chip is enough for v1.
- No arrival timestamp surfaced in UI (can be added later from the row's updatedAt if needed).
- No units/grouping layer for rooms. Rooms remain flat.
- No changes to PACU/OP room semantics.

## Design

### Data model

Extend the existing room model rather than adding a parallel concept. A "Clinic" room is just another physical location in `surgery_rooms`, distinguished by its type.

**Schema changes (`shared/schema.ts`):**

1. Extend `roomTypeEnum`:
   ```
   "OP" | "PACU" | "CLINIC"
   ```
2. Add new FK on `surgeries`:
   ```ts
   clinicRoomId: varchar("clinic_room_id").references(() => surgeryRooms.id),
   ```
   Plus an index `idx_surgeries_clinic_room` on `clinicRoomId`.

**Why a separate FK (not reusing `pacuBedId`):** `pacuBedId` carries PACU semantics across reports, Aldrete scoring, post-op logic, etc. Pointing it at a non-PACU room would be a lie that leaks into those systems. A dedicated `clinicRoomId` keeps both states cleanly separable and makes the sequential-clearing rule explicit rather than implicit.

### Sequential rule

When a PACU bed is assigned to a surgery, `clinicRoomId` is cleared in the same write. This is enforced **server-side** in the surgery update path, not just at the UI — any code path that sets `pacuBedId` must null `clinicRoomId`. This guarantees the invariant regardless of who calls the API.

Clearing a PACU bed does NOT re-populate `clinicRoomId` (the patient has been and gone; no reason to revive waiting state).

### Admin: Add Room dialog

The existing Add Room dialog gets a third option in the type dropdown: **"Clinic"** (alongside OP and PACU). No other admin changes. Hospitals create one or more clinic rooms and name them freely ("Entrance", "IN", "Lobby", "Consult 1"). The type is generic on purpose so future physical locations (consult, lounge, discharge area) can reuse it without another enum change.

### Surgery summary card

The summary card currently exposes a PACU bed picker. Add a **Clinic room picker** as a second line above it. Both are independently assignable, subject to the sequential rule enforced on save (picking a PACU bed clears the clinic selection).

Copy: "Patient location" section with two rows — "Waiting (Clinic)" and "PACU bed".

### OP-Plan card rendering

Per surgery card, the physical-location indicator renders with this precedence:

- `pacuBedId` set → render PACU bed label, as today.
- else `clinicRoomId` set → render the clinic room's **name** as a distinct "waiting" chip (different color from PACU — e.g. amber/neutral to PACU's blue/green). No "Clinic:" prefix — just the room name (e.g. `Entrance`). This avoids the "PACU: IN" awkwardness from the original brainstorm.
- else → empty, as today.

Because the rule is sequential and the FK is cleared server-side when PACU is assigned, the card transitions automatically: "Entrance" → PACU bed label, no manual cleanup.

### Migration

One idempotent migration adding:
- `CLINIC` value to `room_type` enum (`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'CLINIC'`)
- `clinic_room_id` column on `surgeries` (`ADD COLUMN IF NOT EXISTS ... REFERENCES surgery_rooms(id)`)
- `idx_surgeries_clinic_room` index (`CREATE INDEX IF NOT EXISTS`)

Follows the project's idempotency rules (CLAUDE.md).

## Testing

- Unit/integration: surgery update that sets `pacuBedId` clears `clinicRoomId`; setting `clinicRoomId` alone leaves `pacuBedId` untouched; clearing PACU does not repopulate clinic.
- Add Room: creating a `CLINIC` room persists correctly and appears in pickers.
- Surgery summary card: picker UI for both fields, sequential-clearing is visible after save.
- OP-Plan card render: all three states (neither / clinic only / pacu set) render correctly; clinic → pacu transition updates the chip.

## Out of scope / future

- Units layer grouping rooms into OR / Anesthesia / Clinic categories.
- Arrival timestamp display ("waiting 12 min") — possible follow-up if staff ask.
- Waiting queue view / count summary on OP-Plan.
