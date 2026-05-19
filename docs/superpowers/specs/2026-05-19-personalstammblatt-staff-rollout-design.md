# Personalstammblatt rollout to all staff — design

**Date:** 2026-05-19
**Status:** Design approved (pending user spec review)
**Scope:** Extend the existing external-worker Personalstammblatt form to cover all staff (internal + external) on clinics that opt in. Gated by a per-hospital toggle, default disabled.

---

## 1. Problem

Today, the Personalstammblatt (personnel data sheet — name, address, AHV, bank, residence permit, etc.) is only collected from **external workers** through a token-emailed link at `/worklog/:token`. Internal staff have no equivalent flow, so HR cannot maintain a complete personnel file for every staff member on `/business/hr`.

We want clinics that opt in to:

1. See per-staff completeness status directly on the `/business/hr` Staff list.
2. Send a one-click (or bulk) invite email containing a tokenized link to the same form already used by external workers.
3. Track how many times that link has been sent, and surface a follow-up hint once it has been sent 3 or more times.
4. Optionally let staff with app access fill the form in-app (via a top-of-app banner), so the email loop is not the only path.
5. Auto-expire links 30 days after the last send to keep tokens safe.

The feature must be opt-in per clinic (one hospital today, more later if desired) — default disabled, no impact on clinics that do not enable it.

---

## 2. Goals

- Maximum reuse of the existing form (`ExternalWorklog.tsx`) and table (`external_worklog_links`).
- One per-staff invite mechanism that works for both internal and external staff.
- Status visible at a glance on `/business/hr` for opted-in clinics.
- No change of any kind for clinics that do not enable the addon.

## Non-goals

- A "Verified by HR" status (Submitted is the terminal state for now).
- Automatic reminder cadence / cron resends (Phase 1 is manual resend only).
- Per-hospital configuration of required-field set (the minimum set is hardcoded — extensible later if needed).
- Renaming `external_worklog_links` to a more neutral name (deferred).
- A new "contacts" entity — every "staff" row already lives in `users`.

---

## 3. High-level approach

Extend `external_worklog_links` to also represent **personal-data-only** links for any user (internal or external). The existing `/worklog/:token` page detects the `personal_data_only` flag on the link and hides the two worklog-specific tabs (Arbeitseinträge, Kontrakte), leaving only the 5 personal-data tabs. The 5-tab form is extracted into a shared `<StammblattForm>` component so the same code drives both the token-authed and session-authed surfaces.

Gating is a single per-hospital boolean addon flag — when off, every new UI element is hidden and every new endpoint returns 403.

---

## 4. Data model changes

### 4.1 New column on `hospitals`

```sql
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS addon_personalstammblatt boolean NOT NULL DEFAULT false;
```

Surfaced as a toggle in `/admin → Settings → Experimental`, alongside existing addon flags. Read in `useActiveHospital()` so the client can branch on it.

### 4.2 New columns on `external_worklog_links`

```sql
ALTER TABLE external_worklog_links
  ADD COLUMN IF NOT EXISTS user_id varchar
    REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS personal_data_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invited_at timestamp,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamp,
  ADD COLUMN IF NOT EXISTS submitted_at timestamp;

CREATE INDEX IF NOT EXISTS external_worklog_links_user_hospital
  ON external_worklog_links (user_id, hospital_id)
  WHERE user_id IS NOT NULL;
```

- `user_id` is **nullable** because legacy external-worker links may have been created from an email alone (no user row). New invites from `/business/hr` always set it.
- `unit_id` becomes nullable (currently `NOT NULL`):
  ```sql
  ALTER TABLE external_worklog_links
    ALTER COLUMN unit_id DROP NOT NULL;
  ```
  Personal-data-only links do not belong to a specific unit.
- `submitted_at` is `NULL` until required minimums are filled; set once and never cleared.
- Migration is idempotent (all `IF NOT EXISTS` / `IF EXISTS` guards, no destructive operations).

### 4.3 Required-minimum fields for "Submitted"

A link transitions to **Submitted** the first time a save makes all of these non-null and non-empty:

- `first_name`, `last_name`
- `date_of_birth`
- `address`, `city`, `zip`
- `ahv_number`
- `bank_account`

(Other fields stay optional — `has_children`, `has_residence_permit`, `has_own_vehicle`, etc., act as toggles for their sub-sections.)

---

## 5. Backend

### 5.1 Shared helpers

`server/services/stammblatt.ts` (new):

- `ensureStammblattLink(userId, hospitalId): ExternalWorklogLink` — creates a `personal_data_only=true` link if none exists; returns existing one otherwise. Uses the user's `email`, generates a fresh token, sets `token_expires_at = now() + 30d`.
- `rotateStammblattToken(linkId)` — generates a new token, refreshes `token_expires_at`.
- `markSubmittedIfComplete(linkId)` — checks required-minimum fields; sets `submitted_at` if currently null and all are filled.

### 5.2 New routes — HR side (in `server/routes/business.ts`)

All gated by `isBusinessManager` **and** `hospital.addonPersonalstammblatt`. Return 403 when the addon is off.

- `POST /api/business/:hospitalId/staff/:userId/stammblatt-invite`
  - Ensures the link exists for `(userId, hospitalId)`.
  - Rotates the token, refreshes `token_expires_at` (30d from now).
  - Increments `invite_count`, sets `last_invited_at = now()`.
  - Sends email via `sendStammblattInviteEmail()` (new variant of `sendWorklogLinkEmail`, see §5.5).
  - Returns `{ inviteCount, lastInvitedAt, tokenExpiresAt }`.

- `POST /api/business/:hospitalId/staff/stammblatt-invite/bulk`
  - Body: `{ userIds: string[] }` or `{ scope: "all_incomplete" }`.
  - Iterates eligible users (must have a well-formed email; skip Submitted), runs the single-invite flow for each.
  - Returns `{ sent: number, skipped: Array<{ userId, reason }> }`.

### 5.3 New routes — self-fill side (new file `server/routes/me-stammblatt.ts`)

All gated by `isAuthenticated` **and** `hospital.addonPersonalstammblatt` on the user's active hospital. Return 403 when the addon is off.

- `GET /api/me/stammblatt`
  - Looks up the link by `(userId, hospitalId)`.
  - If absent: creates one with `personal_data_only=true`, no token email sent (in-app users do not need a token).
  - Returns the link record (sanitized).

- `PATCH /api/me/stammblatt`
  - Same write surface as the public form's `PATCH /api/worklog/:token/personal-data`.
  - Calls `markSubmittedIfComplete()` after saving.

### 5.4 Modification to existing `GET /api/business/:hospitalId/staff`

The existing aggregation already attaches `workerPortal` data from `external_worklog_links`. Extend it to also attach Stammblatt status (regardless of `staff_type`):

```ts
stammblatt: link
  ? {
      status: deriveStatus(link),  // 'invited' | 'in_progress' | 'submitted'
      inviteCount: link.inviteCount,
      lastInvitedAt: link.lastInvitedAt,
      tokenExpiresAt: link.tokenExpiresAt,
      submittedAt: link.submittedAt,
    }
  : { status: 'missing', inviteCount: 0 }
```

Status derivation:

| Link state | Status |
|---|---|
| No link row | `missing` |
| `last_accessed_at IS NULL` | `invited` |
| `last_accessed_at IS NOT NULL` and `submitted_at IS NULL` | `in_progress` |
| `submitted_at IS NOT NULL` | `submitted` |

### 5.5 Email

New function `sendStammblattInviteEmail(email, token, locale, hospitalName)` in `server/services/email.ts`. Modeled on the existing `sendWorklogLinkEmail` but with a Stammblatt-specific subject/body:

- **DE Subject:** `Bitte füllen Sie Ihr Personalstammblatt aus`
- **DE body:** Greeting + sentence about completing the personnel data sheet for the named hospital + 30-day validity note + clickable button + plain link `${baseUrl}/worklog/${token}`.
- **EN Subject:** `Please complete your personnel data sheet`
- **EN body:** Mirror of the German version.

### 5.6 Token validation update

The existing `GET /api/worklog/:token` handler returns 404 or "expired" when the link is `is_active=false`. Extend to also fail when `token_expires_at IS NOT NULL AND token_expires_at < now()`. The existing expired-token landing UI on `ExternalWorklog.tsx` handles both cases identically.

---

## 6. Frontend

### 6.1 Shared form component

Extract the 5 personal-data tabs from `client/src/pages/ExternalWorklog.tsx` into `client/src/components/stammblatt/StammblattForm.tsx`.

Props:

```ts
interface StammblattFormProps {
  initialData: StammblattData;
  onSave: (patch: Partial<StammblattData>) => Promise<void>;
  permitImageUploadUrl: (side: 'front' | 'back') => Promise<{ url: string }>;
  permitImageReadUrl: (side: 'front' | 'back') => string;
}
```

The two callers (token portal, in-app profile) wire their respective data sources to these props. No business logic differs between the two surfaces — only data plumbing.

### 6.2 Public token portal (`ExternalWorklog.tsx`)

- Load link record (existing behavior).
- If `personal_data_only === true`:
  - Hide the **Arbeitseinträge** and **Kontrakte** tabs.
  - Show header `Personalstammblatt — {hospitalName}` instead of `Arbeitszeiterfassung — {unitName}`.
- Otherwise: unchanged.

### 6.3 In-app profile page (`/profile/stammblatt`)

New route at `client/src/pages/profile/Stammblatt.tsx`:

- Fetches `GET /api/me/stammblatt`.
- Renders `<StammblattForm>` with `PATCH /api/me/stammblatt` wired to `onSave`.
- Shows a top-right "Speichern" button + saved-state badge mirroring the token portal.
- 404 / 403 if addon is off on the active hospital.

### 6.4 App-shell banner

New component `client/src/components/StammblattBanner.tsx`, mounted in the app shell above the main content.

Visible only when **all** of:

- `activeHospital?.addonPersonalstammblatt === true`
- The signed-in user has `canLogin = true`
- A `GET /api/me/stammblatt` returns `submittedAt: null` (or the link is missing — banner triggers ensureStammblattLink on the GET).
- Per-session dismissed flag (sessionStorage) is not set.

Body: single line — `Ihr Personalstammblatt ist noch nicht ausgefüllt.` + button `[Jetzt ausfüllen]` linking to `/profile/stammblatt` + dismiss "×".

Disappears for the rest of the session once dismissed. Reappears next session until `submittedAt` becomes non-null, at which point it never reappears.

### 6.5 `/business/hr` Staff list (`SimplifiedStaff.tsx`)

All additions wrapped in `activeHospital?.addonPersonalstammblatt && isManager`. When off: zero visible change.

When on:

1. **New column** "Personalstammblatt" between Staff Type and Actions. Renders a `<StammblattStatusBadge>`:

   | Status | Color | Label | Sub-line |
   |---|---|---|---|
   | `missing` | red | Fehlt | — |
   | `invited` | amber | Eingeladen | `{inviteCount}× · vor {n}d` |
   | `in_progress` | blue | In Bearbeitung | `{inviteCount}× gesendet` |
   | `submitted` | green | Erhalten | `am {date}` |

   When `inviteCount >= 3` and status is not `submitted`, append a red dot with tooltip `3+ Einladungen versendet — persönlich nachfassen?`.

2. **Per-row action** in the existing row menu (3-dot or dedicated button):
   - `missing` → "Einladung senden"
   - `invited` / `in_progress` → "Erneut senden"
   - `submitted` → "Stammblatt anzeigen" (opens existing details dialog)

   Calls `POST /api/business/:hospitalId/staff/:userId/stammblatt-invite`. Toast on success.

3. **Filter chip** above the table: "Nur unvollständig anzeigen" — narrows to non-`submitted` rows.

4. **Bulk action** in the toolbar: "Einladungen an alle Unvollständigen senden" — confirmation modal showing count + email list preview, then calls the bulk endpoint. Toast with `{ sent, skipped }` summary.

### 6.6 Settings toggle

Add a row to `/admin → Settings → Experimental` matching the existing pattern:

> **Personalstammblatt für alle Mitarbeiter**
> Aktiviert die HR-Funktion, mit der für alle Mitarbeiter (intern und extern) ein Personalstammblatt eingeholt werden kann.
> [toggle]

Persists `addon_personalstammblatt` via the existing `PATCH /api/hospitals/:id` route.

---

## 7. Auth & permissions

- `POST /api/business/:hospitalId/staff/:userId/stammblatt-invite`: `isAuthenticated` + `isBusinessManager` + addon flag check.
- `POST /api/business/:hospitalId/staff/stammblatt-invite/bulk`: same.
- `GET /api/me/stammblatt`, `PATCH /api/me/stammblatt`: `isAuthenticated` + addon flag on active hospital.
- `GET /api/worklog/:token`, `PATCH /api/worklog/:token/personal-data`: unchanged — token already authorizes the request.

---

## 8. Edge cases

- **User with no email or malformed email** — Send-invite button disabled with tooltip "Keine gültige E-Mail-Adresse hinterlegt"; bulk action skips and reports in `skipped`. The synthetic `*.@staff.local` placeholder emails generated by the existing staff-create route are treated as "no valid email" (regex filter on `@staff.local`). Banner is also suppressed for these users (no `submitted_at` reachable since no save path makes sense without HR triage first).
- **User changes email after a link exists** — The link is keyed by `(user_id, hospital_id)`. On resend we update `external_worklog_links.email` to the user's current email; old token still works until expiry but the new email is what we send to. If the new email collides with another user's link in the same hospital (unique `(hospital_id, email)` constraint), the resend fails with a 409 and HR sees a toast — they investigate the duplicate manually.
- **External worker who already has a link with `personal_data_only=false`** — Treated as already-complete-or-in-progress for the HR view (status derives from the same fields). No second link is created. If HR clicks "Resend" on such a row, we resend the existing token, not a new personal-data-only one.
- **Two hospitals, same user** — Each hospital has its own link row; status is per-hospital. Matches existing per-tenant patient-data principle.
- **Addon flipped off after invites have been sent** — Already-issued tokens still work (no flag check on the public form). HR UI hides the column. Re-enabling resumes where it was.
- **Token expired** — Existing expired-token UI shown. HR resending generates a fresh token; user clicks new link, lands on the form normally.
- **Form submitted via banner, then HR clicks Resend** — `submitted_at` does not block resend (HR may want corrections). Resend rotates the token. Submission status remains "submitted" since data is already there. No accidental data loss.
- **Image uploads (residence permit)** — Reuse existing `/api/worklog/:token/permit-image-upload` for token portal. For in-app profile, add `/api/me/stammblatt/permit-image-upload` mirroring the same S3 flow but auth'd by session.

---

## 9. Testing

### 9.1 Unit / integration

- `server/services/stammblatt.test.ts` — `ensureStammblattLink` (creates with correct defaults, idempotent), `rotateStammblattToken`, `markSubmittedIfComplete` (true only when all required minimums set).
- `server/routes/business.stammblatt.test.ts`:
  - 403 when `addonPersonalstammblatt=false`.
  - Single invite creates link, sends email (mocked), increments counter.
  - Resending increments counter, rotates token, refreshes expiry.
  - Bulk endpoint sends to all incomplete with valid email, returns `skipped` for the rest.
- `server/routes/me-stammblatt.test.ts`:
  - 403 when addon off.
  - GET creates link if missing, returns existing one otherwise.
  - PATCH updates fields; sets `submitted_at` once minimums met; subsequent PATCH does not clear it.
- `server/routes/worklog.test.ts` (extend) — Token rejected when `token_expires_at < now()`.

### 9.2 UI / E2E

- `/business/hr` shows column only when addon is on.
- Send-invite button transitions a row from `missing` → `invited` after one click.
- Bulk send: select 5 incomplete users, click bulk action, all 5 transition.
- Banner appears for `can_login=true` user with no link / unsubmitted link; disappears after submission; respects session-level dismiss.
- Public form at `/worklog/:token` with `personal_data_only=true` shows 5 tabs, not 7.

---

## 10. Migration & rollout

1. Generate Drizzle migration from `shared/schema.ts` for the two table changes; convert to idempotent SQL per project rules.
2. Verify migration journal timestamp is higher than all previous entries.
3. Deploy with addon flag at default `false` — zero observable change on any clinic.
4. Flip the toggle on the target hospital from `/admin → Settings → Experimental`.
5. HR uses the new column to send first batch of invites.

No backfill required — existing external_worklog_links rows continue to work (legacy `personal_data_only` defaults to false, legacy `unit_id` remains set, legacy flow unchanged).

---

## 11. Public API docs

None of the new endpoints are public (they all require auth). `PUBLIC_API_MD` in `server/routes/publicDocs.ts` does not need an update.

---

## 12. Open items deferred to future phases

- **Auto-reminder cron** — re-send every 14 days for `invited`/`in_progress` until `invite_count >= 3` or `submitted_at` is set; then flag for manual follow-up. Single new file `server/cron/stammblatt-reminders.ts`.
- **Verified state** — `verified_at`, `verified_by` columns + HR action to mark a submitted Stammblatt as personally checked.
- **PDF export** — `GET /api/business/:hospitalId/staff/:userId/stammblatt.pdf` returning a printable personnel file.
- **Per-hospital required-field config** — JSON on `hospitals` letting admin add/remove required minimums.
- **Rename `external_worklog_links` → `personal_data_links`** — neutral name once internal staff usage grows.
- **Audit log table** — one row per send (`who clicked Send`, when, target user) instead of just a counter.

None are blockers for Phase 1.
