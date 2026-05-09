# Surgery Request Form — UX Phase 1

**Date:** 2026-05-09
**Surface:** `client/src/components/surgery/SurgeryRequestForm.tsx` (used by `client/src/pages/SurgeonPortal.tsx`)
**Why:** The in-portal surgery request form is the primary income channel for the clinic. Surgeons currently see a "naked" Step 1, sparse error feedback, and a long un-grouped Step 2. This phase fixes the highest-leverage friction without backend work.

## Scope

Six changes, shipped together as a single PR. The full UX initiative has three phases (committed earlier); this spec covers **Phase 1 only**. Phase 2 (sticky progress, time-range slider, mobile polish, autosave) and Phase 3 (review screen, existing-patient lookup) get their own specs later.

| # | Change | Component touched |
|---|--------|-------------------|
| 1 | Step 1 surgeon summary card (replaces empty step) | `SurgeonPortal.tsx` + `SurgeryRequestForm.tsx` + `surgeonPortal.ts` |
| 2 | Move "Reserve only" toggle from Step 1 to top of Step 2 | `SurgeryRequestForm.tsx` |
| 3 | Section 2 sub-grouping: Termin / Eingriff / Abrechnung | `SurgeryRequestForm.tsx` |
| 4 | CHOP picker cleanup — single combobox + "free text" toggle | `SurgeryRequestForm.tsx` |
| 5 | Inline field validation — red border + helper text on blur | `SurgeryRequestForm.tsx` |
| 6 | "Missing fields" callout above Continue / Submit | `SurgeryRequestForm.tsx` |

Out of scope: ExternalSurgeryRequest (public form), the calendar tab, any backend route besides extending `/me`.

## Change 1 — Step 1 surgeon summary card

**Today:** When a single (non-praxis) surgeon logs in, Step 1 shows only the "Reserve only" toggle. The accordion section feels broken.

**After:** Step 1 always shows a read-only summary card identifying who's submitting:

- **Praxis with children:** unchanged — picker (Select) renders as today, just nested in a card visual.
- **Single surgeon (non-praxis), or praxis with no children:** card with avatar + name + `email · phone` + "submitting as" tag.

Card layout (left-to-right):
- 40×40 round avatar with initials (last/first), bg `bg-primary`, white text
- name (semibold) above muted-color contact line `email · phone`
- right-aligned uppercase tag "submitting as" / "absendend als" (locale-aware)

**Data:** Extend `GET /api/surgeon-portal/:token/me` to include `phone` from `users.phone`. The form already has `firstName`, `lastName`, `email`. SurgeonPortal passes a new `currentSurgeon` prop into `SurgeryRequestForm`.

**Component contract:**
```ts
type CurrentSurgeon = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

interface SurgeryRequestFormProps {
  // ... existing props
  currentSurgeon?: CurrentSurgeon;  // when present + !showSurgeonPicker, render summary card
}
```

The card renders whenever `!showSurgeonPicker && currentSurgeon` is true. Empty `phone` falls back to just `email`; missing `email` shows just the name. No layout collapse — card height stays consistent.

## Change 2 — "Reserve only" toggle moves to Step 2

**Today:** Toggle sits inside Step 1, after surgeon picker.
**After:** Toggle becomes the first element of Step 2 ("Eingriff & Termin") and is restyled as a highlighted info box (subtle blue background, thin blue border, same `Switch`).

Rationale: Reserve-only is a scope decision about *what's being submitted*, not *who is submitting*. It lives where it changes form behavior (collapsing patient + documents).

The auto-collapse logic (toggling reserve-only while patient/documents is open falls back to surgery section) already exists and continues to work.

## Change 3 — Section 2 sub-groups

Today's Section 2 has 11+ fields stacked. We add three labeled visual groups, each prefaced by a small uppercase muted label. No accordion within accordion — these are just visual bands inside the existing section.

| Group | Label (DE / EN) | Fields |
|---|---|---|
| 1 | Termin / Schedule | wishedDate, durationMinutes, time-range slider |
| 2 | Eingriff / Procedure | surgeryName (CHOP), surgerySide, patientPosition, antibioticProphylaxe |
| 3 | Abrechnung / Coverage | coverageType, stayType, diagnosis, withAnesthesia, anesthesiaNotes |

`surgeryNotes` stays at the very bottom of the section, **outside** any group (free-form, applies to whole request).

In **reservation-only** mode, only Termin renders inside Section 2 (matches existing field-hiding behavior).

## Change 4 — CHOP picker cleanup

**Today:** Searchable popover combobox AND a free-text `<Input>` directly below it. Two ways to do the same thing → confusing.

**After:** One entry point. The combobox (popover with CHOP search) is the default. A small text link below — "+ Freien Text eingeben" / "+ Use custom name" — toggles to a single text input. Toggling back returns to the combobox and clears the custom value if it didn't come from a CHOP match.

State:
- `chopMode: "search" | "custom"` — local component state, defaults to "search"
- `surgeryName` and `chopCode` keep their existing semantics
- Switching `search → custom`: preserves the current `surgeryName` text so a partial entry carries over.
- Switching `custom → search`: keeps `surgeryName` if `chopCode` is set (i.e. it came from a CHOP match); otherwise clears both `surgeryName` and `chopCode` so the surgeon starts fresh in the picker.

## Change 5 — Inline field validation

**Today:** Required fields just have `*`. Errors only manifest as Submit greying out.

**After:** Each required field gains:
- `aria-invalid` and red border (`border-destructive` or equivalent existing class) when the field is **touched and empty**
- a small helper-text error below: "Pflichtfeld" / "Required"
- error state clears on next valid input

**Trigger model — on blur:**
- We track a `Set<keyof SurgeryRequestFormValues>` of fields the user has interacted with (touched-then-blurred).
- A field shows an error iff `touched.has(field) && !valid(field)`.
- Clicking Continue or Submit additionally marks **all** required fields in the current section/form as touched, so anything still empty lights up red.

Required-field set per section is the same logic already used by `sectionValidity` — we just expose it field-by-field. Validity rules don't change.

Affected fields:
- Step 2 / Termin: `wishedDate`, `surgeryDurationMinutes`
- Step 2 / Eingriff: `surgeryName` (when not reservation-only)
- Step 2 / Abrechnung: `coverageType`, `stayType`, `diagnosis` (only when coverageType === "Krankenkasse")
- Step 3 / Patient: firstName, lastName, birthday, phone, street, postalCode, city
- Step 1 / Surgeon: only when `showSurgeonPicker` and `selectedSurgeonId` empty (rare, but covered)

## Change 6 — "Missing fields" callout

**Today:** Continue button silently disabled when section invalid; Submit button silently disabled when form invalid.

**After:** Render an amber callout in two places:

- **Above an invalid Continue button** (within a section): lists only the missing required fields *inside that section*.
- **Above the Submit button** (at the bottom of the form, when the whole form is invalid): lists missing required fields *across all visible sections*.

Wording template: `t("missingFields") + ": " + names.join(", ")`. Field names reuse the same labels shown next to inputs (i.e. translated). Callout is omitted entirely once the section/form is valid — no layout shift; the space is conditional, not reserved.

Per-field validity logic comes from the same source as Change 5 (the field-level rules that already feed `sectionValidity`).

Validation message wording: a uniform "Pflichtfeld" / "Required" for the inline helper text. Field-specific wording (e.g. "Bitte ein Datum auswählen") is intentionally out of scope to keep this change tight.

## i18n — new keys

Added to `tFn` dictionaries (de + en) in `SurgeonPortal.tsx`:

| key | DE | EN |
|---|---|---|
| `surgeonCard.submittingAs` | absendend als | submitting as |
| `chopSearch.useFreeText` | Freien Text eingeben | Use custom name |
| `chopSearch.backToSearch` | Zurück zur Suche | Back to search |
| `validation.required` | Pflichtfeld | Required |
| `missingFields` | Noch erforderlich | Still required |
| `subgroup.schedule` | Termin | Schedule |
| `subgroup.procedure` | Eingriff | Procedure |
| `subgroup.coverage` | Abrechnung | Coverage |

`SurgeryRequestForm` continues to receive a `t(key)` callback prop; it does not import i18n directly.

## Backend change

`server/routes/surgeonPortal.ts` — `GET /:token/me` returns one additional field:

```ts
res.json({
  id, firstName, lastName, email,
  phone: u.phone,           // NEW
  isPraxis,
});
```

No DB migration. `users.phone` already exists.

## Testing

- Update `tests/surgeon-praxis-routes.test.ts` (if it covers `/me` shape) to include `phone` in the expected response. (Spot-check first; add assertion only if the existing test asserts on shape.)
- New component-level tests for `SurgeryRequestForm`:
  - renders summary card when `!showSurgeonPicker && currentSurgeon` is set
  - renders picker (no card) when `showSurgeonPicker` is true
  - reservation toggle now lives inside Step 2 (not Step 1)
  - blur on empty `wishedDate` shows "Pflichtfeld"; typing a valid date clears it
  - clicking Continue with an invalid section marks all required fields as touched and renders amber callout listing them
  - CHOP picker: clicking "+ Freien Text eingeben" hides combobox, shows plain Input; "Zurück zur Suche" restores
- Smoke: in dev, log in as a non-praxis surgeon, verify Step 1 card; toggle reservation-only on Step 2 and confirm patient/documents collapse; submit a complete request end-to-end.

## Risks & rollback

- **Surface area:** ~1 component file (~700 lines after change), ~1 page file, ~1 route. Single-PR rollback is straightforward.
- **Behavior risk:** Validation/touched state is new logic. Mitigation: all rules derive from existing `sectionValidity`; we're surfacing what the form already computes, not changing it.
- **i18n risk:** 8 new keys must land in both DE and EN. Mitigation: tests run against both locales (existing pattern).

## Out of scope (Phase 2 / 3)

Recorded here so they don't creep in:
- Sticky progress header ("Step 2 of 4") — Phase 2
- Smarter time-range slider / chip group — Phase 2
- Mobile polish (tap targets, numeric keyboards) — Phase 2
- Auto-save draft to localStorage — Phase 2
- Review-before-Submit screen — Phase 3
- Existing-patient lookup at top of Section 3 — Phase 3 (needs new backend endpoint)
