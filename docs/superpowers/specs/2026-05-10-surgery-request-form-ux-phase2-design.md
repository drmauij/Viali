# Surgery Request Form — UX Phase 2

**Date:** 2026-05-10
**Surface:** `client/src/components/surgery/SurgeryRequestForm.tsx` (used by `client/src/pages/SurgeonPortal.tsx`)
**Why:** Phase 1 closed the worst friction (empty Step 1, silent disabled Submit, dense Step 2, dual CHOP picker, no field-level errors). Phase 2 polishes the flow: progress visibility while scrolling, mobile usability, and recovery from interruptions.

## Scope

Three changes, shipped together as a single PR. Phase 1 is the predecessor; Phase 3 (review-before-submit, existing-patient lookup) is later and gets its own spec.

| # | Change | Component touched |
|---|--------|-------------------|
| 1 | Sticky progress header — dot row + active step label | `SurgeryRequestForm.tsx` |
| 2 | Mobile polish (4 tweaks) | `SurgeryRequestForm.tsx` |
| 3 | Auto-save draft to localStorage with restore-banner | `SurgeryRequestForm.tsx` (+ new tiny hook) |

Out of scope (intentionally deferred):

- **Time-range slider** — stays unchanged at 08:00–16:00 / 30-min steps. User explicitly said it's working fine.
- **Sticky CTA on mobile** — interacts with virtual keyboards and is its own design problem.
- **Review-before-Submit** — Phase 3.
- **Existing-patient lookup** — Phase 3 (needs new backend endpoint).

---

## Change 1 — Sticky progress header

**Today:** Section progress (green checkmarks on accordion triggers) lives at the top of each accordion item. While the surgeon scrolls a long Step 2 or Step 3, the only progress signal scrolls out of view. There's no answer to "where am I in the queue."

**After:** A compact horizontal row pinned at the top of the form card while scrolling, showing:

- Four small dots — filled (`bg-emerald-600`) for complete steps, hollow (`border-muted-foreground`) for upcoming, ringed-and-filled-primary for the currently-open step.
- The current step's name and ordinal: `"Step 2 of 4 — Surgery & Schedule"` (locale-aware).

The header sits inside the existing `<Card>` that already wraps the form (so it inherits the card's left/right padding) and uses CSS `position: sticky; top: 0;` with a subtle backdrop blur + `bg-card/95` so content scrolling underneath is partly visible. Height ~40px.

The "complete" rule reuses Phase 1's `isSectionComplete(key)` helper — for documents that means at least one attached file (so the dot-row stays consistent with the in-trigger green-check behavior). The "current" step is `openSection`. Reservation-only mode collapses the visible sections from 4 to 2 — the dot row shows two dots in that mode (driven by `visibleSections`).

**Component contract:** New `<ProgressHeader>` private component inside `SurgeryRequestForm.tsx`, taking `{ visibleSections, openSection, isComplete: (key) => boolean, t, sectionTitleKey: (key) => string }`. Pure presentational; no state of its own.

**i18n:** One new key in both DE and EN.
- `progress.stepOfTotal` — `"Schritt {step} von {total}"` / `"Step {step} of {total}"`
- The current step's name reuses existing `t("accordion.surgeon" | "accordion.surgery" | "accordion.patient" | "accordion.documents")`.

**Testing:** New component tests in `tests/surgery-request-form.test.tsx`:
- Header renders 4 dots in default (full-request) mode and 2 in reservation-only mode.
- Active dot reflects `openSection` when the surgeon advances via Continue.
- Header renders the right "Step N of M — Title" string for the current section.

---

## Change 2 — Mobile polish

Four scoped tweaks. Each is one or two lines per input.

### 2a — Numeric keyboards on number-only fields

Add `inputMode` attributes:

| Field | Attribute |
|---|---|
| `surgeryDurationMinutes` | `inputMode="numeric"` |
| `patientPostalCode` | `inputMode="numeric"` |

`patientPhone` already uses the dedicated `PhoneInputWithCountry` component which handles its own keyboard — no change needed.

### 2b — Autocomplete hints on patient address fields

| Field | Attribute |
|---|---|
| `patientFirstName` | `autoComplete="given-name"` |
| `patientLastName` | `autoComplete="family-name"` |
| `patientStreet` | `autoComplete="street-address"` |
| `patientPostalCode` | `autoComplete="postal-code"` |
| `patientCity` | `autoComplete="address-level2"` |
| `patientEmail` | `autoComplete="email"` |
| `patientBirthday` | `autoComplete="bday"` |

`patientPhone` is multi-part inside `PhoneInputWithCountry` and is intentionally skipped for autocomplete in this PR — refactoring that component is out of scope.

### 2c — Stack date + duration vertically on narrow screens

Currently the wishedDate + surgeryDurationMinutes pair uses `<div className="grid grid-cols-2 gap-4">`. On phones this squishes the date input. Switch to `<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">` — date takes full width on narrow viewports, duration stacks beneath. Same pattern is already used elsewhere in the form (e.g. patient firstName/lastName).

### 2d — Tap-target audit (≥44px)

Apple HIG minimum is 44×44 for interactive targets. Two scoped fixes:

1. **CHOP toggle links** ("+ Use custom name" / "← Back to search"): currently rendered as bare `<button>` with `text-xs` and no padding. Add `py-2 -my-2` (vertical padding for the hit area without disturbing visual rhythm).

2. **Switch rows** (antibioticProphylaxe, withAnesthesia, isReservationOnly): each is a flex row containing a `<Label>` and a `<Switch>`. The Radix `Switch` chrome is ~24px tall, so the tap target relies on the surrounding row. Make the entire row clickable by:
   - Wrapping the row content in a `<label>` element (semantic toggle target — clicking anywhere in the row toggles the switch).
   - Bumping vertical padding from the existing `p-3` to `p-3 sm:p-3` (already 44px-equivalent at default text size; confirm visually rather than measuring).

No global CSS change — every adjustment is local class tweaks on the form's own JSX.

### Testing

Mobile polish is mostly attribute-only and won't get a dedicated test. The existing visual smoke-test in Phase 1's Task 9 (manual mobile pass) remains the validation surface. Add one quick test that asserts `surgeryDurationMinutes` has `inputMode="numeric"` and `patientFirstName` has `autoComplete="given-name"` — proves the wiring lands without micromanaging every attribute.

---

## Change 3 — Auto-save draft

**Today:** If the surgeon's session expires, they navigate away, or their phone closes the tab mid-typing, all in-progress data is lost.

**After:**

### Storage scope

```
key: `viali.surgeon-portal.draft.${token}.${surgeonEmail}`
value: JSON.stringify({ savedAt: <iso>, version: 1, values: <SurgeryRequestFormValues without attachedFiles> })
```

- `token` is the portal token (from URL).
- `surgeonEmail` lowercased (from the `me` query already loaded by `SurgeonPortal.tsx`). Scoping by email prevents one surgeon on a shared machine from seeing another's draft.
- `version: 1` to allow future schema migrations.
- `attachedFiles` is intentionally NOT persisted — files live in S3 and re-uploads are required if the user discards their tab.

### Save behavior

- `useEffect` fires on `values` change.
- Debounced 800ms via a small inline `useDebouncedCallback` (or a one-line `setTimeout` + cleanup). No new dependency.
- Skipped while the form is "empty" (i.e. `values` deep-equals `DEFAULT_VALUES` after the user has cleared a draft).
- Skipped while submitting.

### Restore behavior

- On mount, after `me` is available, check localStorage for a key matching this surgeon. If absent → no banner, blank form.
- If present AND `savedAt` is within the last 7 days: render a banner above the form card content (inside the existing `<Card>`, before the accordion):

  > **Continuing your previous draft** · saved 14 min ago — [Restore] [Discard]

  - "Restore" rehydrates `values` from `localStorage` and dismisses the banner.
  - "Discard" deletes the draft and dismisses the banner.
  - Form starts blank either way until the user picks one. (No silent rehydration.)

- If `savedAt` is older than 7 days → silently delete and show no banner (stale draft cleanup).

### Clear behavior

- After a successful submit (the existing `setSubmittedSummary(...)` call site in `SurgeonPortal.tsx`), clear the draft from localStorage.
- "Submit another" (which clears `submittedSummary`) does NOT restore the draft — drafts are explicitly per-completed-form.

### Component contract

A new module `client/src/lib/surgeon-portal-draft.ts`:

```ts
export type SurgeonPortalDraft = {
  savedAt: string;        // ISO timestamp
  version: 1;
  values: SurgeryRequestFormValues;
};

export function loadDraft(token: string, email: string): SurgeonPortalDraft | null;
export function saveDraft(token: string, email: string, values: SurgeryRequestFormValues): void;
export function clearDraft(token: string, email: string): void;
```

The form receives `currentSurgeon` (Phase 1 prop) which carries `email`, plus a new `portalToken` prop. SurgeonPortal threads it from the URL.

### i18n keys (DE + EN)

| key | DE | EN |
|---|---|---|
| `draft.banner.title` | Vorherigen Entwurf fortsetzen | Continuing your previous draft |
| `draft.banner.savedAgo` | gespeichert vor {when} | saved {when} ago |
| `draft.banner.restore` | Wiederherstellen | Restore |
| `draft.banner.discard` | Verwerfen | Discard |

Time-ago formatter: a tiny inline helper that returns "wenige Sekunden / few seconds", "X Minuten", "X Stunden", "X Tage". No new dependency. (A `date-fns` `formatDistanceToNow` is already used elsewhere — prefer that if it's already imported in the form file or in a sibling.)

### Testing

- Unit tests for `surgeon-portal-draft.ts`: save → load round trip; clear; older-than-7-days returns null AND deletes.
- Component test in `tests/surgery-request-form.test.tsx`: when given an `initialValues` simulating a restored draft, the form rehydrates and the banner doesn't appear (banner is parent-level, not form-level — so the test is just on initialValues).
- Component test for SurgeonPortal-side banner: with a draft in localStorage matching the expected key, the banner renders; clicking Restore rehydrates the form; clicking Discard removes the banner. (Mock localStorage in the test environment.)

---

## Files touched

- **Modify** `client/src/components/surgery/SurgeryRequestForm.tsx` — sticky progress header, mobile polish attributes, accept new optional `initialValues` shape (Phase 1 already exposes `initialValues`)
- **Modify** `client/src/pages/SurgeonPortal.tsx` — i18n keys (5 new), thread `portalToken` to the form, wire draft load/save/clear, render the restore banner
- **Create** `client/src/lib/surgeon-portal-draft.ts` — load/save/clear helpers
- **Create** `tests/surgeon-portal-draft.test.ts` — unit tests for the draft module
- **Modify** `tests/surgery-request-form.test.tsx` — sticky progress header tests + mobile-attribute spot-checks

No backend changes. No DB changes.

---

## Risks & rollback

- **localStorage availability:** Some browsers (private mode on Safari pre-15) silently fail. Wrap reads/writes in `try/catch` and fall back to no-op. Worst case: the form behaves exactly like today.
- **Draft schema drift:** Phase 3 may add new form fields. The `version: 1` field allows a check on load — if version mismatches, discard the draft silently. Keeping the field forward-compatible is a few `// @ts-expect-error` lines on the load path; covered in the unit tests.
- **Sticky header z-index conflicts:** Other portal UI (Calendar tab, language switcher) sits above the form card. The sticky header should sit at `z-10` inside the card, NOT a global high z-index. Verified by visual smoke.

---

## Out of scope (Phase 3)

Recorded so they don't creep in:

- Review-before-Submit screen (recap before final send)
- Existing-patient lookup at top of Section 3 (search by name/DOB → autofill, requires new backend endpoint)
