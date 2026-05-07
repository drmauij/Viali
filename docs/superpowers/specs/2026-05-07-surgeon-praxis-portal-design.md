# Surgeon-as-Praxis + In-Portal Surgery Request Form

**Date:** 2026-05-07
**Status:** Design
**Branch (proposed):** `feat/surgeon-praxis-portal`

## Goal

Two linked changes:

1. **Model "praxis" surgeons.** Some external surgeons are medical practices that send requests on behalf of multiple operating doctors (e.g. `info@praxis-mueller.ch` submitting under different surgeon names). Today the public form creates duplicate / synthetic surgeon rows. We want to model the parent–child relationship explicitly: a praxis is a regular user with a flag, and operating doctors point to it.
2. **Move the surgery-request form into the surgeon portal.** Replace the wide-open public submission with an auth-gated form behind the existing surgeon-portal OTP flow. A praxis user submitting a request picks one of their child doctors as the operating surgeon.

## Non-goals

- No new roles. The existing `users.role` system stays untouched.
- No nested praxes. One level only — a praxis cannot have a parent.
- No backfill of existing `externalSurgeryRequests.surgeonEmail` strings into `users`. Old rows stay as-is.
- No soft-delete. Hard deletes only; `parent_surgeon_id` clears via `ON DELETE SET NULL`.
- No cross-hospital praxis identity. Per-hospital scope only — a praxis exists within one hospital's user namespace.

## Schema changes

Single migration `0248_surgeon_praxis.sql` (idempotent — `IF NOT EXISTS` guards per project convention).

### `users` table additions

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_praxis BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS parent_surgeon_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_parent_surgeon_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_parent_surgeon_id_fkey
      FOREIGN KEY (parent_surgeon_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_parent_surgeon_id
  ON users(parent_surgeon_id);
```

Drizzle (`shared/schema.ts` `users` definition):

```ts
isPraxis: boolean("is_praxis").notNull().default(false),
parentSurgeonId: varchar("parent_surgeon_id"),
```

(Drizzle FK declared via reference helper to `users.id` with `onDelete: 'set null'`.)

**Invariants enforced in app code, not DB:**
- A user with `is_praxis=true` cannot have `parent_surgeon_id` set (no nested praxes).
- A child cannot itself be a praxis to others (one-level only).

These are validated in storage helpers at write time. DB stays permissive to avoid CHECK-constraint migration headaches.

### `externalSurgeryRequests` table addition

Add an optional FK so portal-submitted requests carry a real user reference. Old rows stay null.

```sql
ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS surgeon_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_surgery_requests_surgeon_id_fkey'
  ) THEN
    ALTER TABLE external_surgery_requests
      ADD CONSTRAINT external_surgery_requests_surgeon_id_fkey
      FOREIGN KEY (surgeon_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_external_surgery_requests_surgeon_id
  ON external_surgery_requests(surgeon_id);
```

Drizzle: `surgeonId: varchar("surgeon_id")` (nullable, FK to `users.id`).

The existing `surgeonFirstName / surgeonLastName / surgeonEmail / surgeonPhone` columns stay populated alongside `surgeonId` for new requests (resolved from the user record at submit time). This preserves the current admin-UI rendering and keeps email-based matching working for legacy rows.

## Authentication & access

Unchanged. Existing surgeon portal flow stays as-is:

- One per-hospital portal token (e.g. `mWbnplC0zXPocWYEfGhqakBz`)
- `POST /api/portal-otp/request` with `email` → magic-link OTP
- `POST /api/portal-otp/verify` → session cookie scoped to portal
- Session resolves the logged-in user via email lookup against `users` (already implemented at `server/routes/portalOtp.ts:240–251` and `server/storage/surgeonPortal.ts findPortalSessionWithEmail`)

A praxis user authenticates exactly like a solo doctor — they're a regular `users` row that happens to have `is_praxis=true`.

Child doctors keep their own login. If a child is themselves a registered user with `users.email`, they OTP in and act as themselves. Being a child does NOT block direct login.

## Server changes

### New endpoint: in-portal request submission

`POST /api/surgeon-portal/:token/requests` — protected by the existing `requireSurgeonSession` middleware.

Request body (subset of current `insertExternalSurgeryRequestSchema`):

```ts
{
  // Surgery + patient fields: same as today
  surgeryName, surgeryDurationMinutes, withAnesthesia, anesthesiaNotes,
  surgeryNotes, diagnosis, coverageType, stayType,
  wishedDate, wishedTimeFrom, wishedTimeTo,
  patientPosition, leftArmPosition, rightArmPosition,
  isReservationOnly,
  patientFirstName, patientLastName, patientBirthday,
  patientEmail, patientPhone, patientStreet, patientPostalCode, patientCity,

  // NEW: which surgeon this request is for (required)
  surgeonId: string,
}
```

**Surgeon resolution rules:**
- If session user `is_praxis=false`: `surgeonId` MUST equal session user's id. Otherwise 403.
- If session user `is_praxis=true`: `surgeonId` MUST be either (a) one of their children (`parent_surgeon_id = session.userId`) or (b) the praxis itself (in case the praxis owner also operates). Otherwise 403.

The server populates `surgeonFirstName / LastName / Email / Phone` from the resolved user record. Client doesn't send those.

### Deprecate the public endpoint

`POST /public/external-surgery/:token` (`server/routes/externalSurgery.ts`) returns **410 Gone** with a message pointing to the surgeon portal.

The existing client page `client/src/pages/ExternalSurgeryRequest.tsx` is updated to redirect users to the surgeon-portal entry (same per-hospital token URL, OTP gate). No public submission path remains.

### Praxis dashboard roll-up

`getSurgeriesForSurgeon(hospitalId, surgeonEmail, month?)` in `server/storage/surgeonPortal.ts:26` is extended:

1. Resolve the user by `(hospitalId, email)` → `{ userId, isPraxis }`.
2. If `isPraxis=true`: fetch `userId` of all children (`parent_surgeon_id = userId`), collect their emails.
3. Expand both Source 1 (email match in `externalSurgeryRequests.surgeonEmail`) and Source 2 (email match in `surgeries → users`) to use the full email set (praxis + children).
4. Dedup by surgery id as today.

Solo doctors (non-praxis) hit the same code path with a single-element email set — behavior identical to today.

### No new child-management endpoints (yet)

Linking children to a praxis is done by the **clinic admin** in the existing user-management UI: edit a user → toggle "Is a praxis" → if checked, multi-select assigns children (sets `parent_surgeon_id` on each child). No surgeon-portal endpoint for self-service child management in this iteration.

This keeps the surface area minimal. Self-service can come later if needed.

## Client changes

### Surgeon portal — surgery request form

New page/section reachable from the existing surgeon portal landing (`client/src/pages/SurgeonPortal.tsx`):

- **Solo doctor:** form looks like today's `ExternalSurgeryRequest.tsx` minus the "your details" section (surgeon fields are implicit from session). Submit hits new endpoint.
- **Praxis with children:** form adds a required **"Operating surgeon"** picker at the top — single-select dropdown of `[praxis itself, ...children]`, sorted by last name. Selection drives the `surgeonId` field on submit.
- **Praxis with no children:** picker shows praxis only (functionally identical to solo doctor). Admin needs to link children before this is useful.

The picker reuses existing form primitives (`Select` from shadcn). No new component library work.

### Admin — user-management additions

In the admin user edit dialog (existing surface):

- Checkbox **"Is a praxis (multi-doctor practice)"** → sets `is_praxis`.
- When checked, reveal a multi-select **"Associated doctors"** listing all hospital users with `is_praxis=false` and `parent_surgeon_id` either null or already pointing here. Saving rewrites `parent_surgeon_id` on the selected children to point to this user; unselected previously-linked children get `parent_surgeon_id` set to null.
- A user with `parent_surgeon_id` set shows a read-only "Praxis: <name>" badge in their own edit view (informational).

### Public form removal

`client/src/pages/ExternalSurgeryRequest.tsx` is replaced with a small redirect page that points users to `/surgeon-portal/:token`. Same URL token works (per-hospital), so existing surgeon links continue to function — they just land on the OTP gate instead of the open form.

## Storage layer changes

In `server/storage/surgeonPortal.ts` and a new `server/storage/users.ts` (or extending the existing user storage helpers):

- `getChildrenOfPraxis(praxisUserId, hospitalId): Promise<User[]>`
- `setPraxisChildren(praxisUserId, hospitalId, childUserIds: string[])` — transactional rewrite of `parent_surgeon_id` for the given set; validates that none of the children themselves have `is_praxis=true`.
- `togglePraxis(userId, hospitalId, isPraxis: boolean)` — when turning OFF, refuse if the user still has children (force admin to unlink first).

`getSurgeriesForSurgeon` modified per the roll-up logic above. Add a unit test covering: solo doctor, praxis with no children, praxis with children, child of a praxis logging in directly.

## Migration plan

1. Migration `0248_surgeon_praxis.sql` adds the four columns + indexes + FKs. Idempotent.
2. Drizzle schema updated in `shared/schema.ts`.
3. Server endpoints + storage helpers added.
4. Admin UI updated for praxis flag + children multi-select.
5. Surgeon portal request form added.
6. Public form returns 410 / redirects.
7. Smoke test: solo doctor submits → roll-up shows; praxis links 2 children → submits for child A → child A logs in, sees their own surgery; praxis dashboard shows surgeries for self + both children.

No data migration. No backfill of legacy `externalSurgeryRequests` rows.

## Risks & open items

- **Legacy email-match still authoritative for old rows.** A praxis with `is_praxis=true` whose email matches old `externalSurgeryRequests.surgeonEmail` strings will pull those into roll-up. That's actually desirable — the praxis used the same email historically.
- **Admin UI surface:** the multi-select needs to scope to hospital users only. Existing user-edit dialog already scopes by hospital, so this should be a small addition.
- **Public-form 410:** any third-party link (e.g. an email Birgit sent six months ago) that still points to `/public/external-surgery/:token` will break. The redirect page mitigates this for the in-app URL. External email links are out of our control — acceptable.
- **Praxis-self-as-surgeon:** the picker includes the praxis itself in case the practice owner also operates. If clinics report this is confusing, drop it later — children-only is a one-line change.

## Out of scope (for follow-up)

- Self-service child management from inside the surgeon portal.
- Cross-hospital praxis identity.
- Praxis-level analytics (volume by child doctor, etc.).
- Child-doctor invitation flow (admin invites child → email magic link → child registers). Today admin pre-creates children manually.
