# Praxis Mode — Surgeon's Own Viali Instance + Cross-Tenant Referral

**Date:** 2026-05-13
**Status:** Design
**Branch (proposed):** `feat/praxis-mode`
**Related specs:** [2026-05-07-surgeon-praxis-portal-design.md](2026-05-07-surgeon-praxis-portal-design.md) · [2026-05-10-surgeon-portal-account-menu-design.md](2026-05-10-surgeon-portal-account-menu-design.md)

## Goal

Turn the existing surgeon portal — currently a slim "submit-on-behalf" surface — into the entry point for a full Viali tenant that external surgeon practices can use as their own praxis software. The activation is smooth: no app switch, no wizard, no empty state.

From inside their praxis Viali, surgeons manage patients and plan surgeries using the same Viali primitives clinics already use. Surgeries that need to be performed at an external Viali clinic are routed via a new **cross-tenant referral mechanism** that piggybacks on the existing `externalSurgeryRequests` table: the patient + intake snapshot flows over so the destination clinic doesn't re-collect data.

Reuse target: ~99% of existing Viali code. The only new surfaces are the cross-tenant referral plumbing, the praxis-tenant defaults, the smooth in-portal activation, and the reschedule/cancellation alert pattern.

## Non-goals

- No new patient/calendar/booking/intake tables — full reuse of clinic-side primitives in the praxis tenant.
- No outcome loop in v1 (clinic discharge data → praxis Viali). Tracked for v2.
- No praxis-to-praxis referrals.
- No live federation of patient data between tenants — snapshot at referral, status mirror afterward.
- No multi-member praxes in v1 (assistant logins, multiple operating doctors inside one praxis tenant). Sole admin = the surgeon.
- No Tarmed/TARDOC billing.
- No public directory of opted-in clinics. Pairing is auto-initiated by the originating clinic relationship, with manual pairing via share code.
- No replacement of the existing `users.is_praxis` flag (parent-surgeon submitter, 2026-05-07). It stays as a distinct concept — see "Model overlap" below.
- No match-by-fingerprint of incoming snapshots to existing clinic-side patients. v1 always creates a fresh clinic-side patient on accept.

## UX flow — the smooth transition

The surgeon portal and the praxis Viali are **not two apps**. They are one continuous surface that gains tabs as the surgeon activates capabilities.

### Today (pre-activation)

Surgeon logs into `/surgeon-portal` via OTP. Two tabs: **Submit new request** + **My calendar**. Account menu in the top right.

### Activation trigger

A discreet promo card appears on the Submit tab once the surgeon has submitted ≥ 1 request:

> **Manage your own patients & calendar in Viali — included free.**
> Plan your surgeries on your own calendar and send them to the clinic in one click.
> [Try it out →]

Card is dismissable. Re-appears every N submissions (default N=3) until the surgeon activates or permanently dismisses ("Don't show again").

### Click "Try it out"

**Zero-friction activation.** No multi-step wizard. The system:

1. Provisions a `hospitals` row with `tenant_type='praxis'` using the surgeon's existing profile data (name → praxis name, address, timezone, locale).
2. Inserts a `userHospitalRoles` row binding the surgeon as `owner` of the new praxis tenant.
3. Inserts a `clinic_pairings` row auto-pairing the praxis with the clinic they were already submitting to (status = `active`).
4. **Backfills**: every previously-submitted `externalSurgeryRequest` from this surgeon (matched by `surgeonId` or `surgeonEmail`) is mirrored as a `surgeries` row in the new praxis tenant with `referral_status` derived from the original request's lifecycle, and the patient is extracted into the praxis patient list. Idempotent — re-running skips already-mirrored rows.
5. Adds two new tabs to the existing portal navigation: **Patients** + **Schedule**. A soft, dismissable banner at the top: "Complete your praxis profile" → opens an inline editor for branding/logo/opening hours.

The surgeon stays on the same URL family (`/surgeon-portal` or `/portal/<praxis-slug>` — TBD post-spec). Same header, same branding, same nav. Two new tabs appear; the old ones remain. No visual disruption.

A small confirmation modal appears before step 1 — single button, two lines of copy:

> "We'll set up your own Viali workspace using your profile details. Your existing requests will appear in your new calendar. You can edit details anytime."
> [Activate my praxis Viali]

### After activation

The surgeon's portal exposes the relevant praxis Viali features:

- **Submit new request** (existing) — still works for one-off referrals without patient creation.
- **My calendar** (existing) — augmented to show praxis-planned surgeries alongside historical requests in one timeline.
- **Patients** (new) — the praxis-side patient list. Same patient detail UI clinics use, scoped to the praxis tenant.
- **Schedule** (new) — calendar + booking widget config + consultation slots, reusing the existing clinic-side scheduling UI.

Account menu now includes "Praxis settings" for tenant-level config. Workspace switcher is **hidden** unless the surgeon belongs to multiple praxis tenants — the expected case is one praxis per surgeon, and an invisible switcher reinforces "the portal IS my praxis Viali."

### Planning a surgery (praxis side)

Surgeon picks a patient → "Schedule surgery". The existing surgery-creation form appears, scoped to praxis context (clinic-only fields like OR room, anesthesia team are hidden, not just empty). They pick a target clinic from their paired clinics (originating clinic is the default), fill in surgery type + clinical reason + which intake fields to share, and save.

Result: a `surgeries` row is created in the praxis tenant with `referral_status='pending_external'` + `target_hospital_id` set. Simultaneously, a row is inserted into the destination clinic's `externalSurgeryRequests` table with the patient snapshot and back-references. The surgery shows up in the praxis surgeon's calendar tagged "Pending Clinic X confirmation."

### Status round-trip

The clinic admin reviews the request in their existing external-requests inbox (which now displays a "From praxis" badge and shows `source_hospital_id`). On accept → praxis-side surgery `referral_status='confirmed_external'`, date mirrors clinic's confirmed date. On reject → `rejected_external` with optional clinic note. On cancel → `cancelled_external` with optional clinic note. On reschedule → status stays `confirmed_external`, date mirrors, but the alert pattern fires (see next section).

The praxis surgeon's calendar is the single source of truth for what's happening with their patients.

## Reschedule & cancellation alerting

When the destination clinic reschedules or cancels a surgery referred from a praxis, the praxis surgeon must be **proactively alerted** and the change must be **clearly marked** on their schedule. This is a hard requirement, not a nice-to-have.

### Three signals

1. **In-app banner / notification**: a persistent banner appears in the praxis Viali dashboard ("Surgery for [Patient] rescheduled by Clinic X from [old date] to [new date]"). Stays until acknowledged.
2. **Out-of-band notification**: email always; SMS or WhatsApp if the praxis has the addon configured. Delivered via the existing Flows / notification infrastructure.
3. **Calendar entry marker**: the surgery card on the praxis calendar shows a "Rescheduled by clinic" badge with the original date crossed out + the new date. Hover/click reveals the full reschedule history (who, when, optional clinic note). Marker persists until the surgeon dismisses it.

Identical treatment for cancellations (badge: "Cancelled by clinic") and for rejections at acceptance time.

### Acknowledgement

The surgeon clicks "Acknowledge" on the banner or the calendar marker. The acknowledgement is recorded (`reschedule_acknowledged_at`) and the banner disappears. The marker on the calendar card persists (audit / awareness) but loses its high-attention color treatment.

### Multiple reschedules

If the clinic reschedules again after acknowledgement, the cycle repeats — fresh banner, fresh notification, full history visible on the calendar entry.

## Tenant model

### Praxis tenant = `hospitals` row + flag

A praxis is a regular `hospitals` row with:

- `tenant_type = 'praxis'` (new column, enum `clinic|praxis`, default `clinic`).
- Addon flags defaulted to lean values (see "Feature defaults").
- Display label "Praxis" in admin UIs; otherwise treated as a hospital.

### Auth via existing `userHospitalRoles`

The surgeon's `users` row is joined to both their clinic membership (existing) and their praxis tenant ownership (new) via `userHospitalRoles`. Same login. The portal session token carries the active hospital context, which already exists in the system.

### Model overlap with existing `users.is_praxis`

The legacy `users.is_praxis` flag (parent-surgeon submitter, introduced 2026-05-07) is a **distinct concept** from `hospitals.tenant_type='praxis'`:

- `users.is_praxis = true`: a user account submits surgery requests on behalf of multiple operating doctors (a praxis-shared email). The current portal already handles this — no tenant required.
- `hospitals.tenant_type = 'praxis'`: a full Viali tenant configured for praxis use. Owned by one surgeon-user. The user may or may not also have `users.is_praxis=true`.

Both stay. No data migration required. A future cleanup could rename `users.is_praxis` → `users.submits_on_behalf` to disambiguate; out of scope for v1.

## Cross-tenant referral mechanism

The praxis-side `surgeries` row is the source of truth on the praxis side. The destination clinic's `externalSurgeryRequests` row is the source of truth on the clinic side. They are linked bidirectionally so status flows are reliable.

### Status state machine

`referral_status` on the praxis-side surgery:

- `local` — never sent across tenants (a surgery the praxis performs in-house, hypothetical for v1).
- `pending_external` — sent, awaiting clinic response.
- `confirmed_external` — clinic accepted, date confirmed (or updated by reschedule).
- `rejected_external` — clinic refused at acceptance time.
- `cancelled_external` — clinic cancelled an accepted surgery.

Transitions are server-driven by the clinic's actions. The praxis surgeon cannot edit `referral_status` directly; they can only re-send (creates a new external request, archives the old).

### Payload contents (`patient_snapshot` JSONB)

Captured at the moment of referral. Frozen — not updated automatically. The praxis surgeon can manually re-send if patient data changes meaningfully.

- `demographics` — name, DOB, sex, contact, address, insurance ref
- `intake` — structured intake answers from the praxis-side patient record
- `ambulant_eligibility` — Caprini, STOP-BANG, RCRI, Apfel scores + composite if computed
- `consents` — GDPR/DSG consent receipt + scope of share (which fields)
- `shared_at` — ISO timestamp + the `user_id` who initiated

### Acceptance flow on the clinic side

The clinic admin sees the new request in their existing external-requests inbox. The row displays a "From praxis" badge and `source_hospital_id`. On accept:

1. A clinic-side `patients` row is created from the snapshot.
2. A clinic-side `patientQuestionnaireLinks` row + pre-populated `patientQuestionnaireResponses` row are created from `patient_snapshot.intake`, tagged with `imported_from_praxis=true` + per-field source map. **The patient is NOT asked to refill these fields.**
3. `referral_status` on the source praxis-side surgery is updated to `confirmed_external` via a server-side cross-tenant call.

The praxis surgeon's calendar entry updates in place.

### Questionnaire dedup — the patient experience

The whole point of carrying a structured `patient_snapshot` across tenants is so the patient is not asked the same questions twice. Concretely:

- **Imported fields** (demographics, allergies, medications, conditions, etc.) land in the clinic's `patientQuestionnaireResponses` row pre-filled and editable.
- **Patient-facing `/book` link** renders these fields with a "✓ from praxis" indicator beside each section that came from the praxis snapshot, and a top-of-page banner: "Your referring surgeon already shared some of your information. Please review and complete any missing fields."
- **Fields the clinic collects but the praxis didn't** stay blank for the patient to fill — typically surgery-specific intake (last meal time, anesthesia history specific to this op).
- **Audit**: each imported field is traceable to the praxis referral via `imported_field_sources` JSONB on the response row.

Schema impact: add three nullable columns to `patientQuestionnaireResponses` — `imported_from_praxis BOOLEAN`, `imported_from_praxis_at TIMESTAMP`, `imported_field_sources JSONB`. No data migration; legacy rows have these all null.

## Schema changes

Single idempotent migration `0253_praxis_mode.sql` per project convention.

```sql
-- 1. hospitals: tenant type discriminator
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS tenant_type VARCHAR DEFAULT 'clinic';
-- value space: 'clinic' | 'praxis'

-- 2. surgeries: cross-tenant referral fields
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS target_hospital_id VARCHAR;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS external_request_id VARCHAR;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_status VARCHAR DEFAULT 'local';
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_note TEXT;

-- 3. surgeries: reschedule/cancel alert fields
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS last_clinic_reschedule_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_acknowledged_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_history JSONB DEFAULT '[]'::jsonb;
-- reschedule_history shape: [{ from_date, to_date, action: 'rescheduled'|'cancelled', actor_user_id, note, at }]

-- 4. externalSurgeryRequests: back-references + payload
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_hospital_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_surgery_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS patient_snapshot JSONB;

-- 4b. patient_questionnaire_responses: praxis-import provenance
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis BOOLEAN DEFAULT false;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis_at TIMESTAMP;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_field_sources JSONB;

-- 5. clinic_pairings: which praxis can refer to which clinic
CREATE TABLE IF NOT EXISTS clinic_pairings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  praxis_hospital_id VARCHAR NOT NULL,
  clinic_hospital_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  pairing_source VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_pairings_unique_pair') THEN
    ALTER TABLE clinic_pairings ADD CONSTRAINT clinic_pairings_unique_pair UNIQUE (praxis_hospital_id, clinic_hospital_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clinic_pairings_praxis ON clinic_pairings(praxis_hospital_id);
CREATE INDEX IF NOT EXISTS idx_clinic_pairings_clinic ON clinic_pairings(clinic_hospital_id);

-- FK constraints idempotently
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_pairings_praxis_fk') THEN
    ALTER TABLE clinic_pairings ADD CONSTRAINT clinic_pairings_praxis_fk
      FOREIGN KEY (praxis_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_pairings_clinic_fk') THEN
    ALTER TABLE clinic_pairings ADD CONSTRAINT clinic_pairings_clinic_fk
      FOREIGN KEY (clinic_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;
```

Drizzle schema (`shared/schema.ts`) updated correspondingly. All FK declarations via reference helpers.

## Feature defaults for praxis tenant

A new `tenant_type='praxis'` row gets the following addon defaults:

**ON by default:**

- Patient management
- Calendar + booking widget (for consultations, not surgeries)
- Intake / preop forms (reuses existing structure)
- Surgeon profile
- Document templates (consult notes, referral letters)
- Flows (basic email automation)
- WhatsApp (when the addon ships)

**OFF by default:**

- OR planning
- Anesthesia documentation
- Postop orders + discharge medications
- Controlled substances
- OR medications configuration
- Multi-unit setup
- Inventory
- Staff shifts / scheduling
- Pharmacy

All toggleable later via the existing addon UI in praxis settings.

## Clinic pairing model

### Default: auto-pair with originating clinic

The clinic the surgeon was already submitting to via the surgeon portal becomes their first paired clinic automatically on tenant provisioning. `clinic_pairings` row inserted with `pairing_source='auto_on_provision'`.

### Adding more clinics

Praxis admin can add a paired clinic by entering a share code generated from the destination clinic's hospital settings. Status enters as `pending` until the clinic admin approves; flips to `active` on approval. Either side can revoke at any time (status → `revoked`); revoked pairings retain history for audit but disallow new referrals.

## Bootstrap + backfill

### Provisioning steps (atomic, transactional)

1. `INSERT INTO hospitals (tenant_type='praxis', ...defaults pulled from surgeon profile)`
2. `INSERT INTO userHospitalRoles (user_id=surgeon, hospital_id=new_praxis, role='admin/owner')`
3. `INSERT INTO clinic_pairings (praxis=new, clinic=originating_clinic, status='active', pairing_source='auto_on_provision')`
4. Backfill loop (see below).

### Backfill semantics

On activation, scan `externalSurgeryRequests` where `surgeonId = activating_user.id` (fall back to `surgeonEmail` match for legacy rows). For each:

- Create a `surgeries` row in the praxis tenant with:
  - `referral_status` derived from request lifecycle (`confirmed_external` if linked surgery exists in clinic; `pending_external` if still in inbox; `cancelled_external` / `rejected_external` per request status)
  - `target_hospital_id` = originating clinic
  - `external_request_id` = original request id
  - `patient_id` = newly-created patient in the praxis tenant
- Extract patient into the praxis tenant's `patients` table from the request's stored fields.

Idempotent: skip if a praxis-side surgery already exists for the same `external_request_id`. Backfill is capped to surgeries within the last 5 years (configurable).

## Workspace switching UX

- Single tenant (the expected majority): **no switcher visible**. The portal IS the praxis Viali.
- Multi-tenant (rare): small workspace dropdown in the account menu listing accessible workspaces, current one highlighted.

## Privacy & consent

Cross-tenant referral is a one-time act of data sharing initiated by the praxis surgeon for a specific patient. The surgeon is responsible for obtaining the patient's consent per Swiss DSG / GDPR.

At referral time, the surgeon checks a required box:

> "I confirm that the patient has consented to sharing their medical data with [Clinic X] for the purpose of surgery."

The consent receipt is captured in `patient_snapshot.consents` with the timestamp and the user_id who confirmed. No automatic propagation of patient updates across tenants — each tenant holds its own master record post-share.

## Pricing (provisional)

Free for the praxis. The clinic's existing Viali subscription is the revenue source; cross-tenant referrals are a value-add of the clinic's offering. Revisit if standalone praxis usage grows meaningfully or if praxes start using Viali primarily for non-referral purposes.

## Testing

Following the project's testing posture (non-negotiable; too many > too few):

- **Unit**: `tenant_type` defaults, snapshot serialization, status state-machine transitions (including reschedule pattern), pairing CRUD, idempotent backfill.
- **Integration**: end-to-end referral flow (praxis → clinic accept → praxis status update); reschedule mirror + alert pattern; rejection flow; cancellation flow; share-code pairing approval + revocation; multi-reschedule cycle.
- **Storage isolation**: surgeon in praxis A cannot read praxis B's patients; pairing scope (a praxis cannot refer to an unpaired clinic).
- **UI**: promo card placement + dismissal lifecycle; portal navigation gains tabs after activation; calendar shows mixed praxis-planned + clinic-confirmed entries with reschedule badges; banner appears + disappears on acknowledgement.
- **Migration idempotency**: re-run migration 0253 twice, assert no errors and no drift.

## Out of scope for v1

- Outcome loop (clinic discharge data → praxis calendar). Tracked for v2.
- Praxis-to-praxis referrals.
- Live data federation across tenants.
- Multi-member praxis tenants (assistant logins, multiple operating doctors).
- Tarmed/TARDOC billing.
- Public directory of opted-in clinics.
- Match-by-fingerprint of incoming snapshots to existing clinic-side patients (v1 always creates fresh).
- Cross-tenant chat / messaging.
- Praxis-side surgeries performed in-house (no external clinic involved). `referral_status='local'` placeholder exists for v2.

## Open questions

- **URL family after activation**: stay on `/surgeon-portal` for visual continuity, or migrate to `/portal/<praxis-slug>` for cleaner per-tenant routing. Either way, the transition must be invisible to the surgeon at activation time.
- **Backfill 5-year cap**: confirm or relax. Default `5 years` keeps the backfill fast and avoids dragging in stale data.
- **Re-send semantics**: when the praxis surgeon manually re-sends a referral whose snapshot has gone stale, does the old `externalSurgeryRequest` get archived/superseded, or do both rows live on with one marked `superseded_by`? Default proposal: supersede with a back-link, keep both for audit.
- **Workspace switcher edge case**: a clinic staff member who also runs their own praxis tenant — the switcher should appear, but how is "clinic role" vs "praxis role" rendered in the dropdown labels? Worth a UI mock.
