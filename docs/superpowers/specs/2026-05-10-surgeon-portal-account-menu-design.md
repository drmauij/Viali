# Surgeon Portal — Account Menu + My Data

**Date:** 2026-05-10
**Surface:** `client/src/pages/SurgeonPortal.tsx` (header) and a new modal; `server/routes/surgeonPortal.ts` (PATCH route).
**Why:** Surgeons currently have no way to update their own profile after the clinic admin first creates them. They're already shown their own data in the Step 1 summary card (Phase 1) — they should be able to keep it correct. We use this work to also consolidate the existing scattered header controls (separate language buttons + standalone logout) into a single conventional account dropdown, mirroring the main app's `TopBar` pattern.

## Scope

Three coupled changes shipped together:

| # | Change | Component touched |
|---|--------|-------------------|
| 1 | Account dropdown replaces today's `[Globe + DE EN] [Logout]` cluster | `SurgeonPortal.tsx` |
| 2 | "Edit profile" modal with name/phone form | `SurgeonPortal.tsx` (new local component) |
| 3 | `PATCH /api/surgeon-portal/:token/me` backend route | `server/routes/surgeonPortal.ts` |

Out of scope:

- Address fields on `users` (surgeon decided to skip; deferred).
- Change-password / OTP-recovery (portal auth is OTP-link-based; no password to change).
- Profile photo upload (`profileImageUrl` exists on `users` but is not exposed by this PR).
- Editing children's profiles for praxis users — praxis edits its own row only; children stay admin-managed.
- Editing billing identifiers `gln` / `zsrNumber` — clinic-administered, not surgeon-self-service.
- Theme toggle (the portal doesn't currently expose one; out of scope to add).

---

## Change 1 — Account dropdown

**Today:** the page header's right side renders three controls inline:

```tsx
<div className="flex items-center gap-2">
  <div className="flex gap-1">
    <Globe />
    {["de","en"].map(l => <Button>...</Button>)}
  </div>
  <Button onClick={logout}><LogOut /></Button>
</div>
```

**After:** a single avatar button opens a Radix `<DropdownMenu>`:

- **Trigger:** circular `bg-primary text-primary-foreground` avatar (~36px) showing `surgeonInitials(me?.firstName, me?.lastName)` (Phase 1 helper — needs to be exported from `SurgeryRequestForm.tsx` as part of this PR). Hover opacity feedback. `data-testid="account-menu-trigger"`. While `me` is still loading, the helper's existing `"—"` fallback renders and is visually fine — no extra icon needed.
- **Menu content:** width ~256px, right-aligned under the trigger.
  - **Header (non-clickable):** full name (`firstName lastName`) on top, email below (muted, smaller).
  - **Edit profile** — `<Pencil>` icon + label. Opens the My Data modal (Change 2).
  - **Language** — toggles DE↔EN (same `switchLang` handler that exists today). Label shows the *target* language ("Deutsch" when in EN, "English" when in DE), matching the main app's pattern.
  - **Logout** — destructive-color text. Calls the existing logout fetch + reload chain.

The existing inline `Globe + DE EN buttons + logout icon` block is removed entirely.

Use the `<DropdownMenu>` primitive from `@/components/ui/dropdown-menu` (already in project, Radix-backed). Avoids the manual click-outside `useEffect` chain the main `TopBar` uses; cleaner and accessible.

**i18n:**
- `accountMenu.editProfile` — DE: `Profil bearbeiten` / EN: `Edit profile`
- `accountMenu.logout` — already exists as `t.logout` (DE: `Abmelden` / EN: `Logout`); reuse.
- The language label inside the menu is computed from the target language, e.g.:
  ```ts
  language === "de" ? "English" : "Deutsch"
  ```

---

## Change 2 — My Data modal

A `<Dialog>` (shadcn, Radix-backed; pattern already used elsewhere in the portal) titled "My Data" / "Meine Daten". Contains a single `<form>` with four fields and Cancel / Save Changes actions.

**Fields:**

| Field | Behavior |
|---|---|
| Email | Read-only `<Input disabled>` showing `me.email`. Helper text below: "Wird zur Anmeldung verwendet — kann nicht geändert werden" / "Used to log in — cannot be changed". |
| First name * | Plain `<Input>` bound to local form state. Required. Uses Phase 1's `FieldError` + touched-on-blur pattern. `data-testid="input-my-data-first-name"`. |
| Last name * | Same as first name. `data-testid="input-my-data-last-name"`. |
| Phone | Plain `<Input>`. Optional. Stored as a free-text string in `users.phone`. We deliberately do NOT use `PhoneInputWithCountry` here — that component is for patient-facing structured input; the surgeon's phone in `users` has always been free-form. |

**Footer:**

- **Cancel** button — closes the modal without saving. Resets local form state to the current `me` data on next open.
- **Save changes** button — disabled until the form is dirty (any field differs from `me`). Disabled while submitting. Shows a spinner during the mutation.

**Form lifecycle:**

- On modal open, initialize local form state from the `me` query data.
- Inline validation mirrors Phase 1: firstName/lastName required and use `FieldError` after first blur.
- On submit:
  1. Validate (firstName/lastName non-empty after trim).
  2. `PATCH /api/surgeon-portal/:token/me` with `{ firstName, lastName, phone }`. `phone` sent as `null` when the input is empty (server should accept null and store `NULL` in the users.phone column).
  3. On success: invalidate `[`/api/surgeon-portal/${token}/me`]` query so the dropdown header AND the in-form Step 1 summary card both refresh; show a success toast (`t("myData.saveSuccess")`); close the modal.
  4. On failure: keep the modal open; show an error toast (`t("myData.saveFailed") + ": " + error.message`).

**i18n keys (added to DE + EN dictionaries):**

| key | DE | EN |
|---|---|---|
| `myData.title` | Meine Daten | My Data |
| `myData.emailHint` | Wird zur Anmeldung verwendet — kann nicht geändert werden | Used to log in — cannot be changed |
| `myData.cancel` | Abbrechen | Cancel |
| `myData.save` | Speichern | Save changes |
| `myData.saveSuccess` | Profil aktualisiert | Profile updated |
| `myData.saveFailed` | Aktualisierung fehlgeschlagen | Update failed |

`firstName` / `lastName` / `phone` / `validation.required` already exist as keys (Phase 1 reuses).

---

## Change 3 — PATCH `/api/surgeon-portal/:token/me`

**Route:** `PATCH /api/surgeon-portal/:token/me`. Same auth middleware as `GET /me` (`requireSurgeonSession`).

**Request body** (Zod-validated):

```ts
const updateMeSchema = z.object({
  firstName: z.string().trim().min(1, "firstName cannot be empty").max(120),
  lastName: z.string().trim().min(1, "lastName cannot be empty").max(120),
  phone: z.string().trim().max(40).nullable().or(z.literal("")),
}).strict();
```

`.strict()` rejects unknown keys — including `email` — with a 400. This is the explicit guard that prevents email changes via this route. (Belt-and-braces: even if the schema weren't strict, the handler only writes the three columns it pulls out of the parsed body.)

**Handler:**

1. Resolve the authenticated surgeon's email from the session (same pattern as `GET /me`).
2. Look up the user row by email (case-insensitive).
3. Update `users.firstName`, `users.lastName`, `users.phone` on that row only. Empty-string phone is normalized to `null` before the update.
4. Return the same payload shape as `GET /me`: `{ id, firstName, lastName, email, phone, isPraxis }`.

**Praxis behavior:** the route writes whichever row matches the session email — i.e., the praxis row when a praxis user is logged in, the child row when the child is logged in directly. There is no path through this route to write someone else's row.

**Error responses:**

- 400 + Zod field errors when the body fails validation.
- 403 (existing middleware) when the session is missing or expired.
- 404 if the email-resolved user can't be found (defensive — shouldn't happen in practice).
- 500 on db error.

---

## Files touched

- **Modify** `client/src/pages/SurgeonPortal.tsx` — replace inline header controls with `<AccountMenu>` (a small local component) and `<MyDataDialog>`. ~150 net new lines.
- **Modify** `server/routes/surgeonPortal.ts` — new PATCH handler (~30 lines). Reuses `requireSurgeonSession` and the existing `db.update(users)` patterns.
- **Modify** `tests/surgeon-praxis-routes.test.ts` — add a `describe("PATCH /api/surgeon-portal/:token/me")` block covering the four cases listed below.

No new files. No DB migration. No new dependencies (Radix DropdownMenu and shadcn Dialog already in project).

---

## Testing

**Backend route tests** (vitest, the same file/style as the existing `POST /requests` tests):

1. **Solo doctor updates own first/last/phone** — sends valid payload, expects 200 + updated row in db.
2. **Empty firstName rejected** — sends `firstName: ""`, expects 400 with a Zod error.
3. **Email change attempt rejected** — sends `email: "evil@x.com"` alongside valid fields. Expects 400 (`.strict()` rejects unknown key) and confirms email in db is unchanged.
4. **Cross-user write blocked** — solo user A's session can only mutate user A's row. Verified by checking that user B's row is unchanged after A's PATCH.

**Component-level test** (in `tests/surgery-request-form.test.tsx` or a new sibling file): the new `MyDataDialog` is presentational + form-state. A small render-and-submit test asserting:
- Modal renders with values from the `me` prop.
- Save button is disabled when form is pristine and enabled once any field changes.
- Empty firstName + blur → `FieldError` text appears.
- Submit calls the provided `onSave({ firstName, lastName, phone })` callback once.

---

## Risks & rollback

- **Phone normalization (`""` → `null`)** is a small policy choice. Documented above; no surprises.
- **Account-menu replaces three existing buttons** — visual regression risk. Mitigated by keeping the same handlers (logout fetch+reload, switchLang). The dropdown is purely a re-skin.
- **`requireSurgeonSession` already enforces token + email match** — the PATCH route inherits that guarantee. No new auth surface.
- Single PR; rollback is a clean revert.

---

## Out of scope (future work)

Recorded so creep is avoided in this PR:

- Address fields (street/postalCode/city/country) on `users`.
- Profile photo upload.
- Praxis editing children's profiles.
- Editing GLN / ZSR billing identifiers.
- Theme toggle in the portal.
