# Praxis Mode v2 — Design Spec

> **Revision of** [`2026-05-13-praxis-mode-design.md`](./2026-05-13-praxis-mode-design.md). The v1 spec was rewritten in a 2026-05-16 brainstorm. Key changes: room-based referrals (replacing `surgeries.target_hospital_id` with `surgery_rooms.linked_hospital_id`), unified Quick Schedule dialog (no separate praxis surgery form), real-time destination-side availability overlay (hard-blocked, not just informational), and role-neutral schema/UI naming (source/destination + "referral partners" instead of praxis/clinic + pairings).

## Goal

Let an external surgeon submitting requests through `/surgeon-portal` activate a full Viali tenant in place — their own praxis — managing patients, calendar, and referrals to other Viali hospitals without leaving Viali. The praxis surgeon plans surgeries on their own OR calendar; surgeries scheduled in a clinic-linked logical room are automatically submitted as cross-tenant referrals to the destination hospital.

## Architecture overview

- **Both ends are `hospitals` rows.** The asymmetry between source and destination is per-pairing role, not a permanent type. `hospitals.tenant_type` (`'clinic' | 'praxis'`) is a discriminator used only at activation time (it shapes addon defaults). The referral mechanic itself is tenant-type-agnostic.
- **Clinic-linked logical rooms.** A `surgery_rooms` row with `linked_hospital_id` set is a "logical" room representing slots at the destination hospital. Surgeries scheduled in such a room are referrals; scheduling in a normal physical room is a regular in-hospital surgery.
- **Referral wire.** Scheduling a surgery in a clinic-linked room atomically creates an `external_surgery_requests` row in the destination hospital. The source-side `surgeries` row is the source of truth on the source side; the destination's `external_surgery_requests` row is the source of truth on the destination side. They are linked bidirectionally so status flows reliably.
- **Snapshot bridges patient data.** Patient data is per-tenant in Viali — no global patient registry. At referral submit, a frozen `patient_snapshot` JSONB blob carries demographics + intake + ambulant scores + consent across hospitals. Updates after submit do NOT propagate; each hospital owns its own row.
- **Real availability is queryable.** Source-side calendar shows destination busy zones inline; the source surgeon can only drag into free zones (hard-blocked). Server re-validates at submit. Reschedule loop is a rare edge case rather than the norm.

## Scope (v1)

In scope:
- Activation flow (modal → atomic provisioning → seeded calendar)
- Cross-tenant referral mechanic (room-based)
- Real-time destination availability overlay with hard-blocked busy zones
- Status loopback (accept / reject / reschedule / cancel) with reschedule alerting (in-app banner + email + WhatsApp)
- Faithful seeding of historical `external_surgery_requests` (including slot reservations)
- Cross-tenant questionnaire dedup (source intake imports into destination questionnaire with provenance)
- Destination-side inbox surfacing (badge, snapshot preview, optional auto-invite for questionnaire when source didn't fill)
- Manual referral partner pairing (one-time code flow)
- Onboarding coachmark tour (4 steps, dismissable, resumable)
- Post-success discovery panel (toast + side panel with 2 cards: Appointments, Sharable links)

Out of scope (deferred to v2+):
- Outcome loop (post-surgery data flowing back to source hospital)
- Praxis-to-praxis referrals or multi-hop chains
- Multi-member source hospitals (assistant logins, multiple surgeons sharing a praxis)
- Live patient data sync across hospitals (use snapshots only)
- Patient SSO across hospitals (patients may end up with two portals)
- Global patient registry
- Source-side custom notification templates or sender domains
- Source-hospital-initiated reschedule (only cancel-pending is allowed source-side)
- Source-hospital deactivation / undo
- Hard-delete propagation across hospitals
- Tarmed/TARDOC cross-hospital billing
- Public directory of paired-acceptable destinations
- Clinic-admin "external-bookable" slot tagging (overlay uses raw busy state)

## Activation flow

**Trigger.** Surgeon clicks "Activate full praxis" on a promo card in the surgeon-portal Submit tab.

**Modal.** Single screen, two required fields:
- Praxis name (becomes `hospitals.name`)
- Password (sets/upgrades credentials for email+password login)

The surgeon's email is already known from the surgeon-portal OTP context — no email field shown.

**Atomic server work** (one transaction):
1. Insert `hospitals` row: `name`, `tenant_type='praxis'`, lean addon defaults (`addonClinic`, `addonQuestionnaire`, `addonAmbulantEligibility`, `addonPatientChat` ON; `addonSurgery`, `addonMonitor`, `addonLogistics` OFF).
2. Set/upgrade the surgeon user's password.
3. Insert `userHospitalRoles` row: user as `admin` of the new source hospital.
4. Discover every distinct destination hospital the surgeon has historical `external_surgery_requests` with: `SELECT DISTINCT hospital_id FROM external_surgery_requests WHERE surgeon_id = $1`.
5. For each destination, insert `referral_partnerships` row (status `active`, `pairing_source='auto_on_provision'` for the originating destination, `'historical_import'` for the others) and a `surgery_rooms` row in the new source hospital with `name = destination.name`, `type='OP'`, `linked_hospital_id = destination.id`, `sort_order` ordered by request count.
6. Seeding (next section).
7. Set the user's `activeHospitalId` to the new source hospital.
8. Issue a fresh session cookie in the same response — no re-login.
9. Redirect to `/anesthesia/op` (the OR calendar of the new tenant).

If any step fails, the entire transaction rolls back. The surgeon never sees a half-provisioned tenant.

## Schema changes

Migration `0253_praxis_mode.sql`, fully idempotent. Use only Drizzle-compatible SQL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... END $$` with `pg_constraint` checks for FKs/unique).

**Added columns:**

| Table | Column | Type | Default | Notes |
|---|---|---|---|---|
| `hospitals` | `tenant_type` | varchar | `'clinic'` | `'clinic' \| 'praxis'`. Used only at activation; not branched on for the referral mechanic. |
| `surgery_rooms` | `linked_hospital_id` | varchar | NULL | FK → `hospitals(id) ON DELETE SET NULL`. If non-null, this room is a logical room representing slots at the linked destination hospital. |
| `surgeries` | `external_request_id` | varchar | NULL | No FK (cross-tenant). Links a source-side surgery to its `external_surgery_requests` twin. |
| `surgeries` | `referral_status` | varchar | `'local'` | `'local' \| 'pending_external' \| 'confirmed_external' \| 'rejected_external' \| 'cancelled_external'`. Drives the visual badge. |
| `surgeries` | `referral_note` | text | NULL | Destination's reject / reschedule / cancel reason copied here. |
| `surgeries` | `last_clinic_reschedule_at` | timestamp | NULL | Set when destination reschedules. |
| `surgeries` | `reschedule_acknowledged_at` | timestamp | NULL | Set when source surgeon dismisses the alert banner. |
| `surgeries` | `reschedule_history` | jsonb | `'[]'::jsonb` | Audit trail of every status transition: `{ from_status, to_status, from_date, to_date, at, by_user_id, by_hospital_id, reason }`. |
| `external_surgery_requests` | `source_hospital_id` | varchar | NULL | FK → `hospitals(id) ON DELETE SET NULL`. Identifies the originating source hospital. |
| `external_surgery_requests` | `source_surgery_id` | varchar | NULL | No FK (cross-tenant). Back-reference to the source-side `surgeries.id`. |
| `external_surgery_requests` | `patient_snapshot` | jsonb | NULL | Frozen patient demographics + intake + ambulant scores + consent at submit time. Shape documented below. |
| `patient_questionnaire_responses` | `imported_from_praxis` | boolean | `false` | True when this row was created by destination-side accept of a cross-tenant snapshot. |
| `patient_questionnaire_responses` | `imported_from_praxis_at` | timestamp | NULL | When the import happened. |
| `patient_questionnaire_responses` | `imported_field_sources` | jsonb | NULL | Per-field provenance map, e.g. `{ allergies: 'source_referral', medications: 'source_referral' }`. Removed entry → patient edited that field. |

**Dropped from original spec** (no longer needed thanks to the room model):
- `surgeries.target_hospital_id` — derivable from `surgery_rooms.linked_hospital_id` via the surgery's room.

**New table `referral_partnerships`:**

| Column | Type | Notes |
|---|---|---|
| `id` | varchar PK | `gen_random_uuid()` |
| `source_hospital_id` | varchar NOT NULL | FK → `hospitals(id) ON DELETE CASCADE` |
| `destination_hospital_id` | varchar NOT NULL | FK → `hospitals(id) ON DELETE CASCADE` |
| `status` | varchar NOT NULL | `'active' \| 'pending' \| 'suspended' \| 'revoked'`, default `'active'` |
| `pairing_source` | varchar NOT NULL | `'auto_on_provision' \| 'historical_import' \| 'manual_code'` |
| `created_at` | timestamp | default `now()` |

Unique constraint on `(source_hospital_id, destination_hospital_id)`.

**Indexes added:**
- `surgery_rooms(linked_hospital_id)`
- `surgeries(external_request_id)`, `surgeries(referral_status)`
- `external_surgery_requests(source_hospital_id)`
- `referral_partnerships(source_hospital_id)`, `referral_partnerships(destination_hospital_id)`

**`patient_snapshot` JSONB shape:**

```json
{
  "demographics": {
    "firstName": "Petra", "lastName": "Hofer", "birthday": "1985-03-12",
    "sex": "F", "email": "...", "phone": "...",
    "street": "...", "postalCode": "8001", "city": "Zürich"
  },
  "intake": {
    "allergies": "none",
    "medications": "...",
    "conditions": {...},
    "prior_surgeries": [...],
    "anaesthesia_history": "...",
    "smoking": false,
    "...": "whatever the source questionnaire engine produces"
  },
  "ambulant_eligibility": {
    "caprini": 4, "stop_bang": 2, "rcri": 0, "apfel": 1, "composite": "low_risk"
  },
  "consents": {
    "given": true, "scope": "surgery_referral", "at": "2026-05-16T14:30:00Z",
    "user_id": "<source surgeon user id>"
  },
  "shared_at": "2026-05-16T14:30:00Z"
}
```

`intake` and `ambulant_eligibility` are nullable / partial — if the patient hasn't completed a questionnaire on the source side, these are empty objects or omitted. Destination side handles partial snapshots gracefully.

## Seeding contract

Inside the activation transaction, after partnerships and rooms are set up:

1. Pull `external_surgery_requests` rows where `surgeon_id = surgeon.id` AND `wished_date >= now() - INTERVAL '5 years'`.
2. For each request, dedupe-or-create patient in the new source hospital using natural key `(firstName, lastName, birthday)`. If multiple historical requests reference the same human, link to one row. `sex` defaults to `'O'` (surgeon-portal form doesn't capture sex; surgeon edits later).
3. Insert a `surgeries` row in the new source hospital with:
   - `patient_id` (or NULL for slot reservations with `is_reservation_only=true`)
   - `surgery_room_id` = the clinic-linked room for that destination
   - `planned_date` = `wished_date` combined with `wished_time_from` (or noon if no time)
   - All clinical / scheduling fields copied 1:1 from the request: `surgery_name → planned_surgery`, `chop_code`, `surgery_side`, `antibiose_prophylaxe`, `diagnosis`, `anesthesia_notes`, `surgery_notes → notes`, `coverage_type`, `stay_type`, `surgery_risk_class`, `patient_position`, `left_arm_position`, `right_arm_position`
   - `no_pre_op_required = NOT with_anesthesia` (inverted)
   - `surgeon_id = surgeon.id`
   - `external_request_id = request.id`
   - `referral_status` mapped from `request.status`:
     - `'pending'` → `'pending_external'`
     - `'scheduled'` → `'confirmed_external'`
     - `'declined'` → `'rejected_external'`
   - `status = 'planned'`, `planning_status = 'pre-registered'`

**Idempotency.** Before each insert, check `WHERE hospital_id = source AND external_request_id = request.id`. If exists, skip. Safe to re-run.

**Skipped seeds:**
- Requests with `surgeon_id IS NULL` (legacy public-form submissions; can't attribute to this surgeon).
- Requests older than the configurable 5-year window.

**Not seeded:** historical questionnaire responses (predate the `patient_snapshot` mechanism — nothing to import).

## Cross-tenant referral mechanic

### Submit flow (source side)

The source surgeon drags / clicks a free slot in a clinic-linked logical room. The Quick Schedule Surgery dialog opens with the room and time pre-selected. The surgeon picks a patient (or uses inline "+ New patient" — see Quick Schedule extensions below), fills the surgery fields, clicks **Submit to {Destination.name}** (the button's label changes when the room is clinic-linked).

A confirmation dialog appears with snapshot preview:

> Submit this surgery to **Klinik Sonnenhof**?
>
> The destination will receive your patient's information (demographics, intake responses, ambulant scores) and respond with accept, reject, or reschedule. You can cancel before they accept.

Two buttons: **Submit** / **Cancel**. The consent is captured (stored in `patient_snapshot.consents`).

**Server flow on submit:**

1. Begin transaction.
2. Re-validate destination availability (race-safe — see Availability overlay below). If the slot just became busy, abort with 409 Conflict; frontend refreshes the overlay and toasts.
3. Insert / update `surgeries` row in source hospital: `referral_status='pending_external'`, `external_request_id=NULL` initially, `surgeon_id=surgeon.id`.
4. Build `patient_snapshot` JSONB from the source-side patient + any matching questionnaire responses + ambulant scores.
5. Insert `external_surgery_requests` row in destination hospital with all surgery fields mapped + the snapshot + `source_hospital_id`, `source_surgery_id`.
6. Update source surgery: `external_request_id = newRequest.id`.
7. Commit.
8. Notify destination admin via existing external-request notification email / inbox highlight.

### Cancel a pending referral (source side)

The pending tile's context menu has a "Cancel request" action. Confirmation dialog: "Cancel this referral? The destination will be notified."

On confirm:
- `external_surgery_requests.status='declined'`, `cancellation_reason='cancelled_by_source'`
- Source `surgeries.referral_status='cancelled_external'`, source surgery archived (tile removed from calendar — the source surgeon initiated this, no need for a reminder)

### Edit after submit

**Not allowed in v1.** To change details, cancel + resubmit. Edits open a Pandora's box (did the destination see the new version? is this a re-submission or an update?). Keeping the row write-once is safe.

## Real-time destination availability overlay (hard-blocked)

When a clinic-linked logical room is rendered on the source surgeon's calendar, the frontend queries the destination for its busy windows in the visible time range.

- **Endpoint:** `GET /api/referral-partnerships/:destinationHospitalId/availability?from=<iso>&to=<iso>`
- **Auth:** caller's active hospital must have an `active` referral_partnership with `destinationHospitalId`. Otherwise 403.
- **Response:** anonymized busy windows — `[{ start, end, room_id, reason }, ...]` where `reason ∈ {'booked', 'closed', 'maintenance'}`. No patient names, diagnoses, or surgeon IDs.

**Frontend behavior:**

- Busy zones render as muted/striped background on the room's column.
- Drag handlers refuse drops onto busy zones. Click on a busy zone shows a tooltip: "Not available at {Destination.name} — pick another time."
- Drag onto a free zone opens Quick Schedule normally.

**Race condition:**

Between view and submit, a slot may become busy. The submit endpoint re-validates at commit time using the same query. On conflict: HTTP 409 with `{ error: 'slot_taken', refreshAvailability: true }`. Frontend re-fetches the overlay and shows a toast.

## Quick Schedule extension

The existing `QuickCreateSurgeryDialog` (`client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx`) is reused with one extension:

**Inline "+ New patient" form** today captures: firstName, surname, birthday, sex, phone. To match what destination hospitals expect from current `external_surgery_requests` rows, add **four more fields**: email, street, postal code, city. When the parent surgery's room has `linked_hospital_id` set, these four fields are required. For non-linked rooms (e.g. a praxis-internal physical room — rare in v1), they remain optional.

**No other form work needed.** All clinical fields (`coverageType`, `stayType`, `diagnosis`, `surgeryRiskClass`, etc.) are already present. `withAnesthesia` derives from `noPreOpRequired` (inverted) at server-side mapping time.

**Mapping layer (server-side):** the surgery → external request mapping uses:
- `planned_surgery → surgery_name`
- `notes → surgery_notes`
- Slot start time → `wished_date` + `wished_time_from`; `wished_time_to = wished_time_from` (precise time, not range) in v1
- `!no_pre_op_required → with_anesthesia`
- All other fields 1:1

## Cross-tenant questionnaire dedup

**Source-side questionnaire fill.** The source hospital exposes a public open questionnaire URL (the existing `/admin/links → Other Links → Open Questionnaire Link` mechanism — already supported for any `hospitals` row). The source surgeon shares this URL via whatever channel (email, SMS, QR code on a card). The patient fills it via the open link. On submit, the server tries to match by `(firstName, lastName, birthday)` to an existing source-hospital patient and either links or auto-creates. The resulting `patientQuestionnaireResponses` row lives in the source hospital.

**Submission side.** At referral submit, the snapshot's `intake` is populated from the matched source-side `patientQuestionnaireResponses` row. If none exists, `intake` is empty/partial.

**Acceptance side (destination).** When the destination admin accepts a request with `patient_snapshot.intake` non-empty:
1. Create destination `patients` row from `patient_snapshot.demographics`.
2. Create destination `patientQuestionnaireResponses` row with `imported_from_praxis=true`, `imported_from_praxis_at=now()`, `imported_field_sources` (per-field provenance map), and values from `patient_snapshot.intake`.
3. Create `patientQuestionnaireLinks` token with status `'completed-imported'` (substate: pre-populated, awaiting patient review).
4. Auto-send the patient invitation link (default-on toggle in the accept dialog) so the patient confirms the pre-filled fields.

**Patient experience on the destination questionnaire link.** The questionnaire is pre-filled with `imported_from_praxis_*` fields showing a green "**✓ from your praxis · review**" badge. Top banner: "Some of your information has been shared by your referring practice. Please confirm or update." Editing any field clears that entry from `imported_field_sources` (provenance updates as the patient touches things). Submit overwrites with the final answers.

**No questionnaire on the source side?** The destination admin accept dialog shows a checkbox: "Patient questionnaire not yet completed — send the patient a portal invite to fill it at this hospital." Default-on. Falls back to the existing destination-side patient questionnaire flow.

## Destination-side surfacing

The destination admin uses the existing external-request inbox — no new top-level UI. Source-sourced rows (`source_hospital_id IS NOT NULL`) get distinct treatment:

- **Badge** next to the surgeon name: "🏥 From {Source.name}". Hover shows: "Submitted via Viali by Dr. {Surgeon}, {timestamp}."
- **Optional inbox filter chip:** "From referral partner" — lets admins triage cross-tenant vs legacy public-form traffic.

**Accept flow.** Clicking Accept on a row with `patient_snapshot != NULL` opens a snapshot preview dialog showing demographics, surgery summary, ambulant assessment, and the list of pre-filled questionnaire fields. The admin confirms and the server runs the destination-side import (described in Cross-tenant questionnaire dedup).

**Reject flow.** Mandatory reason captured in a small dialog. Stored on `external_surgery_requests.cancellation_reason` and copied to source-side `surgeries.referral_note`.

**Reschedule flow.** Editing the surgery's date / time after accept triggers the push to source with `isReschedule: true` and updates source-side `last_clinic_reschedule_at`, appends `reschedule_history`, and triggers source-side alerting (next section).

**Cancel-after-accept flow.** Mandatory reason. Mechanically same as reject, with `referral_status='cancelled_external'` and the alerting treatment of reschedule.

## Status loopback and reschedule alerting

**Push channel.** Server-side function `pushReferralStatus({ externalRequestId, newStatus, confirmedDate?, note?, isReschedule?, byUserId, byHospitalId })` invoked inside the destination-side transaction. Same Postgres DB → no webhooks, no eventual consistency. The function is idempotent (repeated calls with the same inputs result in the same state).

**Per-state behavior:**

| Destination action | Source `referral_status` | Tile visual | Alert channel | Ack required |
|---|---|---|---|---|
| Accept | `confirmed_external` | yellow → green; `planned_date` set to confirmed time | In-app toast next session | No |
| Reject | `rejected_external` | grey strikethrough + reason tooltip | Sidebar dot; gentle email | Acknowledge → archive |
| Reschedule (after accept) | `confirmed_external` + reschedule fields | dashed-red border, new date, ghost old date | **Banner + email + WhatsApp** | Acknowledge banner |
| Cancel (after accept) | `cancelled_external` | grey strikethrough + reason | **Banner + email + WhatsApp** | Acknowledge → archive |
| Source-initiated cancel (pre-accept) | `cancelled_external` | tile removed from calendar | None | n/a |

**Reschedule banner mechanics.**

- Banner visible when `last_clinic_reschedule_at > coalesce(reschedule_acknowledged_at, '-infinity')` for any surgery the user owns.
- Single case: "**{Destination.name} rescheduled Hofer:** Mon 16 → Wed 18. [Acknowledge]"
- Multiple: "**3 surgeries rescheduled.** Review →" — opens an aggregate list dialog.
- Persistent across sessions until acknowledged. Endpoint: `POST /api/surgeries/:id/acknowledge-reschedule`.
- Tile keeps the dashed-red border until the rescheduled date has passed; then fades to confirmed-green.

**Out-of-band notification dispatch.**

Triggered on `isReschedule: true` OR `newStatus='cancelled_external'` on a previously-confirmed surgery:

1. **Email** to `surgeon.email`, subject like "Surgery rescheduled at {Destination.name} — {Patient name}, {new date}". Body: short template — old date, new date, reason if provided, link to the source-side surgery.
2. **WhatsApp** to `surgeon.phone` (if WhatsApp opt-in is set on the user record): short message with key info + deep link.
3. Both fire-and-forget after the DB commit (notification failures never block the destination mutation).

**Audit trail.** Every status push appends to `surgeries.reschedule_history` (despite the column name, it captures all status transitions). Visible via a "View history" link on the source-side tile detail.

**Reject / cancel archival.** Source surgeon clicks the strikethrough tile → expansion shows the reason + an "Archive" button. Archive sets `archived_at` on the surgery (using the existing soft-archive mechanism — see `surgeries.is_archived`). Archived surgeries disappear from active calendar views but persist in patient records.

## Referral partner management

Either side can initiate a new partnership via a one-time short code.

### Code generation (destination side)

The destination admin opens `/admin/links → Referral Partners` (new panel) and clicks "Generate code". The server returns an 8-character code (`crypto.randomBytes(4).toString("hex").toUpperCase()`) valid for 30 minutes, stored in-memory (Map keyed by code → `{ destinationHospitalId, expiresAt }`). The admin shares the code with the source surgeon out of band (email, phone, meeting). Codes are single-use.

### Code redemption (source side)

The source surgeon opens `/admin/links → Referral Partners` and clicks "Add referral partner". A text field accepts the 8-character code. On submit:

1. Server looks up the code. If expired or unknown → 404 / error message.
2. Insert `referral_partnerships` row with `source_hospital_id = active hospital`, `destination_hospital_id` from the code, `status='pending'`, `pairing_source='manual_code'`.
3. Consume the code (remove from map).
4. Notify destination admin: "Pairing request from {Source.name} — review →" (in-app, email).

### Approval (destination side)

Destination admin sees pending partnerships in the Referral Partners panel and approves or rejects:

- **Approve:** `status='active'`. A clinic-linked logical room appears in the source surgeon's OR calendar named after the destination. Both sides get an in-app notification.
- **Reject:** `status='revoked'`, partnership dropped. Source sees "Pairing declined by {Destination.name}".

### Revoke (either side)

Either side can revoke from their respective panel. `status='revoked'`. The clinic-linked logical room in the source hospital is kept (historical surgeries remain visible) but new submissions are server-side blocked with a clear message: "Partnership with {Destination.name} ended on {date}." Tooltip on the disabled room explains the state.

### Endpoints

- `GET /api/referral-partnerships` — list active hospital's partnerships
- `POST /api/referral-partnerships/codes` — generate a one-time code (destination action)
- `POST /api/referral-partnerships/redeem` — redeem a code (source action), body `{ code }`
- `POST /api/referral-partnerships/:id/approve` — destination approves
- `POST /api/referral-partnerships/:id/reject` — destination rejects
- `POST /api/referral-partnerships/:id/revoke` — either side revokes
- `GET /api/referral-partnerships/:destinationHospitalId/availability` — busy-window query (described in Real-time destination availability overlay)

## Inherited surfaces (zero implementation work)

The new source hospital inherits these existing features automatically, simply by being a `hospitals` row:

- **Public booking page** (`/book` family) — surgeon shares with referral sources or patients for consultation appointments. Configured in `/admin/links → Booking & Appointments` (existing `BookingTokenSection`).
- **Open questionnaire link** (no per-patient token) — `/admin/links → Other Links → Open Questionnaire Link` (existing).
- **Short URL aliases** for both surfaces.
- **QR code generation** for both surfaces (existing — `import QRCode from "qrcode"` in Settings.tsx).
- **Appointments tab** (`/appointments`) — for consultations and follow-ups.
- **Patient management** (`/anesthesia/patients` or wherever the existing patient list lives).
- **All other existing Viali features** that are scoped per `hospitals` row.

The post-success discovery panel deep-links to these existing surfaces; no new components are built.

## Onboarding coachmark tour

**Goal:** teach the new submission mechanic via one guided submission. Non-modal coachmarks overlaid on the live UI. Dismissable at any step. State persisted in `localStorage` (`praxis-tour-step`, `praxis-tour-completed`).

**4 steps:**

1. **Pick a destination** — coachmark on the first clinic-linked room column: "Click a room — each represents one of your referral partner hospitals. Free time slots will appear in white; busy slots are muted."
2. **Pick a time** — when cursor enters the room column: "Drag or click in a free slot. Busy zones are blocked — pick a time that's open at {Destination.name}."
3. **Fill the surgery details** — when Quick Schedule opens: "Same fields you know. If the patient is new, use the **+** to add them inline."
4. **Submit** — when the submission confirmation dialog appears: "Review what gets sent to {Destination.name}, then submit."

Every coachmark has an "× Dismiss tour" link. Dismissed tours can be restarted from `/admin/settings → Help → Replay onboarding tour`. If the surgeon bails mid-tour and returns, the tour resumes at the next pending step on the next session.

**Zero-state handling.** If the surgeon has zero seeded surgeries AND only one paired destination, step 1 lands on that single room. Subsequent steps work identically.

## Post-success discovery

Triggered after the surgeon's first successful submission via the praxis instance.

**Toast** (3 seconds, top-center): "✓ Surgery submitted to {Destination.name}"

**Side panel** (top-right, collapsible, persistent until dismissed, 2 cards):

1. **Appointments** — "Manage consultations and follow-ups in your own calendar." Click → `/appointments`.
2. **Sharable booking & questionnaire links** — "Share your booking link and questionnaire with your patients." Click → `/admin/links`.

Side panel auto-collapses after either card is clicked or after the user dismisses it via the × button. State persisted in `localStorage` (`praxis-discovery-dismissed`). Re-openable from `/admin/settings → Help → Replay discovery panel`.

## Notification inheritance

Source hospitals inherit platform-level email and WhatsApp config in v1. Reschedule emails use the Viali platform sender; WhatsApp notifications use the central Viali Business number. No source-hospital-level notification configuration UI in v1. The surgeon's `users.email` and `users.phone` are the destinations.

## Auth bridge

The surgeon-portal session (existing OTP-based) and the new source-hospital admin session coexist on the same user record:

- Activation upgrades the user's password (sets `password_hash` if absent).
- Activation issues a fresh session cookie scoped to the new source hospital and sets `activeHospitalId` accordingly.
- The surgeon-portal continues to work via OTP for partnerships the surgeon has not (yet) activated against — they can submit to clinics they're a "guest surgeon" at via OTP, and submit to clinics they have a partnership with via their source hospital's OR calendar.

After activation, password is the new primary auth method; OTP remains as a fallback (existing surgeon-portal mechanism).

## Edge cases (v1 handles)

- **Zero-history activator** — only the originating destination is auto-paired. Calendar shows one room. Tour works.
- **Active surgeon-portal session at activation time** — silently upgraded; no re-login.
- **Patient name collision during seeding** — natural-key dedup within the source hospital merges to one row.
- **Tour bailed mid-flow** — resumable from settings; never re-pops automatically.
- **Submit-time race condition** — server re-validates availability and returns 409; frontend refreshes overlay.
- **Multiple reschedules at once** — banner aggregates.
- **Destination revokes partnership** — historical clinic-linked room stays read-only; new submissions blocked with a clear message.

## Migration / rollout

- Migration `0253_praxis_mode.sql` runs in production. Idempotent — safe re-run.
- No backfill of historical clinics' `tenant_type` needed (default `'clinic'` covers them all).
- Activation entry point is the surgeon-portal Submit tab promo card — surgeons opt in.

## Open questions (resolved during 2026-05-16 brainstorm)

- ~~URL family after activation~~ — surgeon is redirected into the new source hospital's `/anesthesia/op` (standard admin URL); the old `/surgeon-portal` still works for non-paired destinations.
- ~~Backfill window cap~~ — 5 years, configurable.
- ~~Re-send semantics~~ — no edit after submit; cancel + resubmit for changes.
- ~~Patient data duplication~~ — accepted for v1; snapshot bridges intake. Global registry deferred to v2+.
- ~~Patient portal duplication~~ — clinic-side portal only for v1; source-side questionnaire is open-link, no per-patient tokens.

## References

- Original spec: [`2026-05-13-praxis-mode-design.md`](./2026-05-13-praxis-mode-design.md)
- `/book/:token` route purpose: [`reference_book_route.md`](../../../.claude/projects/-home-mau-viali/memory/reference_book_route.md)
- Patient data per-tenant: [`feedback_patient_data_per_tenant.md`](../../../.claude/projects/-home-mau-viali/memory/feedback_patient_data_per_tenant.md)
- Admin Links surface: `client/src/pages/admin/Settings.tsx` (line 719 nav, line 1343 tab content)
- Quick Schedule dialog: `client/src/components/anesthesia/QuickCreateSurgeryDialog.tsx`
- Surgery form fields: `client/src/components/anesthesia/SurgeryFormFields.tsx`
- External surgery request schema: `shared/schema.ts:5642`
- Surgeries table: `shared/schema.ts:1172`
- Surgery rooms table: `shared/schema.ts:328`
- Patients table: `shared/schema.ts:923`
