# Surgery Request Form UX Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three Phase 2 UX improvements to the in-portal surgery-request form: a sticky progress header, four mobile-polish tweaks, and a localStorage-backed auto-save draft with a restore banner.

**Architecture:** Two component-level additions in `SurgeryRequestForm.tsx` (the sticky header + a few attribute changes). One new tiny module `client/src/lib/surgeon-portal-draft.ts` for localStorage helpers. `SurgeonPortal.tsx` threads a new `portalToken` prop and renders the restore banner. Five new i18n keys in both DE and EN.

**Tech Stack:** React + TypeScript, TanStack Query, Radix Accordion, Tailwind, Vitest + @testing-library/react with jsdom env. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-10-surgery-request-form-ux-phase2-design.md`

---

## File map

- **Modify** `client/src/components/surgery/SurgeryRequestForm.tsx` — sticky progress header + mobile polish attribute tweaks
- **Modify** `client/src/pages/SurgeonPortal.tsx` — i18n keys (5 new), thread `portalToken`, render restore banner, wire load/save/clear of drafts
- **Create** `client/src/lib/surgeon-portal-draft.ts` — load/save/clear localStorage helpers, isolated and testable
- **Create** `tests/surgeon-portal-draft.test.ts` — unit tests for the draft module
- **Modify** `tests/surgery-request-form.test.tsx` — sticky progress header tests + mobile-attribute spot-checks
- **Modify** `tests/surgery-request-form.test.tsx` (separate task) — banner integration test (covers full flow)

---

## Task 1: Add i18n keys

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`

The form receives translations via a `t(key)` callback prop. Add 5 new keys to the DE and EN dictionaries up front so subsequent tasks can reference them.

- [ ] **Step 1: Add 5 keys to the German (`de`) dictionary**

Open `client/src/pages/SurgeonPortal.tsx`. Find the `de` dictionary block (it ends near line 174 on the current branch with `"documents.uploadDisabled":...`). Insert before its closing `}`:

```ts
    // Phase 2 UX additions
    "progress.stepOfTotal": "Schritt {step} von {total}",
    "draft.banner.title": "Vorherigen Entwurf fortsetzen",
    "draft.banner.savedAgo": "gespeichert vor {when}",
    "draft.banner.restore": "Wiederherstellen",
    "draft.banner.discard": "Verwerfen",
```

- [ ] **Step 2: Add the same 5 keys to the English (`en`) dictionary**

```ts
    // Phase 2 UX additions
    "progress.stepOfTotal": "Step {step} of {total}",
    "draft.banner.title": "Continuing your previous draft",
    "draft.banner.savedAgo": "saved {when} ago",
    "draft.banner.restore": "Restore",
    "draft.banner.discard": "Discard",
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SurgeonPortal.tsx
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): add Phase 2 UX i18n keys

Adds 5 translation keys (DE + EN) for the upcoming Phase 2 work:
sticky progress header label and the auto-save draft restore
banner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Sticky progress header

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

A pinned-to-top dot row + active step label. The header shows a dot per visible section (full-request mode → 4 dots, reservation-only mode → 2 dots) and the current step's name and ordinal. Reuses `isSectionComplete` from Phase 1.

- [ ] **Step 1: Add the failing test**

Append to `/home/mau/viali/tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — sticky progress header", () => {
  it("renders 4 dots and a 'Step 1 of 4' label in default mode", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    const header = container.querySelector('[data-testid="form-progress-header"]');
    expect(header).not.toBeNull();
    const dots = header!.querySelectorAll('[data-progress-dot]');
    expect(dots.length).toBe(4);
    expect(header!.textContent).toContain("progress.stepOfTotal");
    expect(header!.textContent).toContain("accordion.surgeon");
  });

  it("renders 2 dots in reservation-only mode", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        initialValues={{ isReservationOnly: true }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    const dots = container.querySelectorAll('[data-progress-dot]');
    expect(dots.length).toBe(2);
  });

  it("advances the active dot when surgeon Continue is clicked", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const header = container.querySelector('[data-testid="form-progress-header"]')!;
    expect(header.textContent).toContain("accordion.surgery");
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "sticky progress header"`
Expected: FAIL — no header element rendered yet.

- [ ] **Step 3: Add a `ProgressHeader` private component**

Open `/home/mau/viali/client/src/components/surgery/SurgeryRequestForm.tsx`. Add a new private component just below the existing `MissingFieldsCallout` (around line 235–250):

```tsx
type SectionTitleKey =
  | "accordion.surgeon"
  | "accordion.surgery"
  | "accordion.patient"
  | "accordion.documents";

const SECTION_TITLE_KEY: Record<SectionKey, SectionTitleKey> = {
  surgeon: "accordion.surgeon",
  surgery: "accordion.surgery",
  patient: "accordion.patient",
  documents: "accordion.documents",
};

function ProgressHeader({
  visibleSections,
  openSection,
  isComplete,
  t,
}: {
  visibleSections: SectionKey[];
  openSection: SectionKey;
  isComplete: (key: SectionKey) => boolean;
  t: (key: string) => string;
}) {
  const total = visibleSections.length;
  const currentIdx = Math.max(0, visibleSections.indexOf(openSection));
  const stepNumber = currentIdx + 1;

  const stepOfTotalText = t("progress.stepOfTotal")
    .replace("{step}", String(stepNumber))
    .replace("{total}", String(total));

  const currentTitle = t(SECTION_TITLE_KEY[openSection] ?? "accordion.surgeon");

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      data-testid="form-progress-header"
    >
      <div className="flex items-center gap-1.5">
        {visibleSections.map((key) => {
          const complete = isComplete(key);
          const active = key === openSection;
          const dotClass = active
            ? "h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/30"
            : complete
              ? "h-2.5 w-2.5 rounded-full bg-emerald-600"
              : "h-2.5 w-2.5 rounded-full border border-muted-foreground/40";
          return <div key={key} className={dotClass} data-progress-dot data-key={key} />;
        })}
      </div>
      <div className="flex-1 truncate text-xs text-muted-foreground">
        {stepOfTotalText} — <span className="font-medium text-foreground">{currentTitle}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render the header inside the form**

Find the `return (...)` of `SurgeryRequestForm`. Currently it's `<form onSubmit={handleSubmit} className="space-y-4">`. Wrap the form's content so the header is the first child of the form's root element:

```tsx
return (
  <form onSubmit={handleSubmit} className="space-y-4">
    <ProgressHeader
      visibleSections={visibleSections}
      openSection={openSection}
      isComplete={isSectionComplete}
      t={t}
    />
    <Accordion ...>
      ...
    </Accordion>
    ...
  </form>
);
```

(Leave the rest of the form body unchanged — the header's `position: sticky` works against the closest scrolling ancestor; the page's main scroll container fills that role.)

- [ ] **Step 5: Run the tests — confirm they pass**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "sticky progress header"`
Expected: 3/3 PASS.

- [ ] **Step 6: Run all form tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Run: `npm run check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): sticky progress header

Pinned-to-top dot row + active step label. Reuses the Phase 1
isSectionComplete helper so dots stay consistent with the
in-trigger green checks. 4 dots in default mode, 2 in
reservation-only mode (driven by visibleSections).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mobile polish

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

Four sub-changes in one task. Each is one or two lines per input.

- [ ] **Step 1: Add a smoke test for `inputMode` and `autoComplete` wiring**

Append to `/home/mau/viali/tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — mobile attributes", () => {
  it("sets inputMode='numeric' on duration and postalCode, and autocomplete on patient identity fields", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);

    const duration = container.querySelector('[data-testid="input-surgery-duration"]') as HTMLInputElement;
    expect(duration.getAttribute("inputmode")).toBe("numeric");

    // Advance to patient section by filling step 2 minimum + clicking Continue is
    // out of scope for this smoke test. Patient fields are mounted inside the
    // patient AccordionContent, which is not in DOM until that section opens.
    // Instead, verify the patient block markup directly via re-render with
    // initialValues that mark step 2 valid... but this is an attribute assertion;
    // the simplest approach is to grow the existing render and click through.
  });
});
```

The patient-field assertions are simpler if we render with the patient section already open. Add this second test:

```tsx
it("sets autocomplete attributes on patient identity fields", () => {
  const { container } = render(
    <SurgeryRequestForm
      {...baseProps}
      currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      initialValues={{
        wishedDate: "2026-06-01",
        surgeryName: "Test surgery",
        coverageType: "Selbstzahler",
        stayType: "ambulant",
      }}
    />,
    { wrapper: makeQueryWrapper() },
  );
  // Open surgeon then surgery (auto-valid surgeon) then patient
  openSurgerySection(container);
  const surgeryContinue = container.querySelector('[data-testid="button-continue-surgery"]') as HTMLButtonElement;
  fireEvent.click(surgeryContinue);

  const firstName = container.querySelector('[data-testid="input-patient-first-name"]') as HTMLInputElement;
  expect(firstName.getAttribute("autocomplete")).toBe("given-name");

  const postalCode = container.querySelector('#patientPostalCode') as HTMLInputElement;
  expect(postalCode.getAttribute("autocomplete")).toBe("postal-code");
  expect(postalCode.getAttribute("inputmode")).toBe("numeric");
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "mobile attributes"`
Expected: FAIL — attributes don't exist yet.

- [ ] **Step 3: Add `inputMode` to numeric-only fields**

In `client/src/components/surgery/SurgeryRequestForm.tsx`:

- Find `surgeryDurationMinutes` `<Input type="number" ...>` and add `inputMode="numeric"`.
- Find `patientPostalCode` `<Input ...>` and add `inputMode="numeric"`.

- [ ] **Step 4: Add `autoComplete` to patient identity fields**

| Field | Add attribute |
|---|---|
| `patientFirstName` | `autoComplete="given-name"` |
| `patientLastName` | `autoComplete="family-name"` |
| `patientStreet` | `autoComplete="street-address"` |
| `patientPostalCode` | `autoComplete="postal-code"` |
| `patientCity` | `autoComplete="address-level2"` |
| `patientEmail` | `autoComplete="email"` |
| `patientBirthday` | `autoComplete="bday"` |

`patientPhone` (PhoneInputWithCountry) is intentionally skipped — refactoring that component is out of scope for this PR.

For `patientBirthday` the current element is a `FlexibleDateInput`. Read its props; if it forwards `autoComplete` to the inner `<Input>`, add it. If not, skip the birthday autocomplete (best-effort) — do NOT modify FlexibleDateInput in this task.

- [ ] **Step 5: Stack date + duration on narrow screens**

In the schedule subgroup of Step 2, find:

```tsx
<div className="grid grid-cols-2 gap-4">
```

(wraps wishedDate + surgeryDurationMinutes). Change to:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

- [ ] **Step 6: Tap-target tweaks (CHOP toggle links + switch rows)**

For both CHOP toggle links ("+ Use custom name" and "← Back to search"), find their `<button type="button" className="text-xs text-primary hover:underline" ...>` and change the className to:

```
"text-xs text-primary hover:underline py-2 -my-2"
```

The negative margin keeps the visual rhythm while expanding the hit area to ~36px.

For the three switch rows (`isReservationOnly`, `antibioseProphylaxe`, `withAnesthesia`), wrap each row's content in a `<label htmlFor={switchId}>` so clicking anywhere in the row toggles the switch. Each row currently looks like:

```tsx
<div className="flex items-center justify-between p-3 ...">
  <div>
    <Label htmlFor="reservationOnly" ...>...</Label>
    <p ...>...</p>
  </div>
  <Switch id="reservationOnly" ... />
</div>
```

Change to:

```tsx
<label htmlFor="reservationOnly" className="flex items-center justify-between p-3 ... cursor-pointer">
  <div>
    <span className="font-medium">{t("reservationOnly")}</span>
    <p ...>...</p>
  </div>
  <Switch id="reservationOnly" ... />
</label>
```

(Replace the inner `<Label>` with a plain `<span>` because the outer `<label>` already provides the click semantics. Keep all existing classes; only swap the outer `div` for `label` and add `cursor-pointer`.)

- [ ] **Step 7: Run the tests — confirm they pass**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Expected: ALL form tests PASS.

Run: `npm run check`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): mobile polish (inputMode/autocomplete/stacking/tap targets)

Four small wins for surgeons submitting from a phone:
- inputMode="numeric" on duration and postal code
- autoComplete attributes on patient identity fields so iOS/Android
  show "fill from contacts" prompts
- date+duration grid stacks vertically on phones (grid-cols-1
  sm:grid-cols-2) so the date input gets full width
- CHOP toggle links and switch rows have larger hit areas; switch
  rows wrap in <label> so the whole row toggles

patientPhone autocomplete intentionally skipped — PhoneInputWithCountry
refactor is out of scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Draft module

**Files:**
- Create: `client/src/lib/surgeon-portal-draft.ts`
- Create: `tests/surgeon-portal-draft.test.ts`

Isolated localStorage helpers for surgeon-portal drafts. Pure module — no React, no other dependencies. Easy to unit test in isolation before wiring into the page.

- [ ] **Step 1: Add the failing tests**

Create `/home/mau/viali/tests/surgeon-portal-draft.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  type SurgerySnapshot,
} from "../client/src/lib/surgeon-portal-draft";

const TOKEN = "tok-1";
const EMAIL = "Surgeon@Example.COM";

const baseValues: SurgerySnapshot = {
  surgeryName: "Test",
  // The actual SurgeryRequestFormValues shape has many fields; the draft
  // module accepts an opaque snapshot, so we type-check via SurgerySnapshot.
  // For the test we only care about a representative subset.
} as unknown as SurgerySnapshot;

describe("surgeon-portal-draft", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save → load round trip", () => {
    saveDraft(TOKEN, EMAIL, baseValues);
    const loaded = loadDraft(TOKEN, EMAIL);
    expect(loaded).not.toBeNull();
    expect(loaded!.values).toEqual(baseValues);
    expect(loaded!.version).toBe(1);
    expect(typeof loaded!.savedAt).toBe("string");
  });

  it("scopes by token + email (case-insensitive email)", () => {
    saveDraft(TOKEN, EMAIL, baseValues);
    expect(loadDraft(TOKEN, "surgeon@example.com")).not.toBeNull();
    expect(loadDraft("other-tok", EMAIL)).toBeNull();
    expect(loadDraft(TOKEN, "other@example.com")).toBeNull();
  });

  it("clearDraft removes the entry", () => {
    saveDraft(TOKEN, EMAIL, baseValues);
    clearDraft(TOKEN, EMAIL);
    expect(loadDraft(TOKEN, EMAIL)).toBeNull();
  });

  it("returns null and deletes the entry when older than 7 days", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const stale = JSON.stringify({ savedAt: eightDaysAgo, version: 1, values: baseValues });
    // Manually plant a stale entry
    localStorage.setItem(
      `viali.surgeon-portal.draft.${TOKEN}.${EMAIL.toLowerCase()}`,
      stale,
    );
    expect(loadDraft(TOKEN, EMAIL)).toBeNull();
    expect(
      localStorage.getItem(`viali.surgeon-portal.draft.${TOKEN}.${EMAIL.toLowerCase()}`),
    ).toBeNull();
  });

  it("returns null on version mismatch", () => {
    const futureVersion = JSON.stringify({
      savedAt: new Date().toISOString(),
      version: 99,
      values: baseValues,
    });
    localStorage.setItem(
      `viali.surgeon-portal.draft.${TOKEN}.${EMAIL.toLowerCase()}`,
      futureVersion,
    );
    expect(loadDraft(TOKEN, EMAIL)).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    const original = global.localStorage;
    // @ts-expect-error simulating Safari private mode
    delete (global as any).localStorage;
    Object.defineProperty(global, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage disabled");
      },
    });
    try {
      expect(() => saveDraft(TOKEN, EMAIL, baseValues)).not.toThrow();
      expect(loadDraft(TOKEN, EMAIL)).toBeNull();
      expect(() => clearDraft(TOKEN, EMAIL)).not.toThrow();
    } finally {
      Object.defineProperty(global, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `npx vitest run tests/surgeon-portal-draft.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the draft module**

Create `/home/mau/viali/client/src/lib/surgeon-portal-draft.ts`:

```ts
// localStorage-backed draft persistence for the surgeon-portal request form.
// Pure module — no React. The "snapshot" is opaque to this module so callers
// can pass any shape (we only persist + restore JSON). Stale drafts (>7 days)
// or mismatched versions are silently discarded on load.

const KEY_PREFIX = "viali.surgeon-portal.draft";
const CURRENT_VERSION = 1 as const;
const MAX_AGE_DAYS = 7;

export type SurgerySnapshot = Record<string, unknown>;

export type SurgeonPortalDraft = {
  savedAt: string;
  version: typeof CURRENT_VERSION;
  values: SurgerySnapshot;
};

function storageKey(token: string, email: string): string {
  return `${KEY_PREFIX}.${token}.${email.toLowerCase()}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(token: string, email: string, values: SurgerySnapshot): void {
  const ls = safeStorage();
  if (!ls) return;
  const payload: SurgeonPortalDraft = {
    savedAt: new Date().toISOString(),
    version: CURRENT_VERSION,
    values,
  };
  try {
    ls.setItem(storageKey(token, email), JSON.stringify(payload));
  } catch {
    // Quota exceeded or write disabled; ignore.
  }
}

export function loadDraft(token: string, email: string): SurgeonPortalDraft | null {
  const ls = safeStorage();
  if (!ls) return null;
  const key = storageKey(token, email);
  let raw: string | null;
  try {
    raw = ls.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SurgeonPortalDraft;
    if (parsed.version !== CURRENT_VERSION) {
      ls.removeItem(key);
      return null;
    }
    const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
    if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      ls.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      ls.removeItem(key);
    } catch {
      /* noop */
    }
    return null;
  }
}

export function clearDraft(token: string, email: string): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(storageKey(token, email));
  } catch {
    /* noop */
  }
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npx vitest run tests/surgeon-portal-draft.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/surgeon-portal-draft.ts \
        tests/surgeon-portal-draft.test.ts
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): localStorage draft module

Pure-TS load/save/clear helpers for the surgeon-portal request form
draft. Scoped per portal token + per surgeon email. Discards drafts
older than 7 days or with a version mismatch on load. Wraps all
localStorage access in try/catch so Safari private mode falls back
to no-op.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: SurgeonPortal restore banner + form integration

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

Wire the draft module into the page. Save on form changes (debounced 800ms). Show a restore banner above the form card content when a draft exists. Restore rehydrates the form via `initialValues`. Discard deletes and clears the banner. Submit clears the draft.

- [ ] **Step 1: Add the failing test**

Append to `/home/mau/viali/tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — initialValues rehydrate", () => {
  it("rehydrates form values from initialValues prop", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        initialValues={{
          surgeryName: "Restored procedure",
          surgeryDurationMinutes: 90,
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    // Surgery name button (CHOP picker default mode) should reflect the value
    const chopButton = container.querySelector('[data-testid="button-chop-search"]');
    expect(chopButton?.textContent).toContain("Restored procedure");
    const duration = container.querySelector('[data-testid="input-surgery-duration"]') as HTMLInputElement;
    expect(duration.value).toBe("90");
  });
});
```

- [ ] **Step 2: Run the test — should fail or pass depending on existing state**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "initialValues rehydrate"`

If the form already supports `initialValues` (Phase 1 declared the prop), this will PASS. If not, it will FAIL and you need to wire the prop into `useState` initial value. Read the form's `useState<SurgeryRequestFormValues>` initializer (around line 224 of the current branch):

```ts
const [values, setValues] = useState<SurgeryRequestFormValues>(() => ({
  ...DEFAULT_VALUES,
  ...initialValues,
}));
```

This is already correct — `initialValues` is merged into defaults on mount. The test should pass without further form changes.

- [ ] **Step 3: Add an `onValuesChange` callback prop to the form**

The page needs to know when `values` changes (so it can save the draft). Add an optional callback prop.

In `client/src/components/surgery/SurgeryRequestForm.tsx`, in `SurgeryRequestFormProps`:

```ts
  /**
   * Fired whenever the form's internal values change. Used by the parent
   * to persist a localStorage draft.
   */
  onValuesChange?: (values: SurgeryRequestFormValues) => void;
```

Destructure `onValuesChange` in the component signature. Add a `useEffect` near the top of the component body (after `useState<SurgeryRequestFormValues>`):

```ts
useEffect(() => {
  onValuesChange?.(values);
}, [values, onValuesChange]);
```

- [ ] **Step 4: Wire SurgeonPortal — load, save, clear, render banner**

Open `/home/mau/viali/client/src/pages/SurgeonPortal.tsx`.

**4a)** Add imports near the top:

```ts
import {
  loadDraft,
  saveDraft,
  clearDraft,
  type SurgeonPortalDraft,
} from "@/lib/surgeon-portal-draft";
```

**4b)** Inside the component (after `me` is fetched), add draft state:

```ts
const [draftBanner, setDraftBanner] = useState<SurgeonPortalDraft | null>(null);
const [restoredInitialValues, setRestoredInitialValues] = useState<
  SurgeryRequestFormValues | undefined
>(undefined);

// Check for an existing draft on first render after `me` is available.
useEffect(() => {
  if (!me?.email) return;
  const existing = loadDraft(token, me.email);
  if (existing) {
    setDraftBanner(existing);
  }
  // Run only once per (token, email) — once the user picks Restore or Discard,
  // the banner is gone and we don't re-prompt for the same draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [me?.email]);
```

**4c)** Add a debounced save callback:

```ts
const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const handleFormChange = useCallback(
  (values: SurgeryRequestFormValues) => {
    if (!me?.email) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(token, me.email!, values as unknown as Record<string, unknown>);
    }, 800);
  },
  [me?.email, token],
);

useEffect(() => {
  return () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  };
}, []);
```

(Add `useCallback` and `useRef` to the existing react imports if not already present.)

**4d)** Wire into the existing `submitRequest.mutate` `onSuccess`:

In the existing `submitRequest = useMutation({...})` block, find `onSuccess: (_data, variables) => { ... setSubmittedSummary(variables); ... }`. After `setSubmittedSummary(variables);`, add:

```ts
if (me?.email) {
  clearDraft(token, me.email);
}
```

**4e)** Render the restore banner above the New Request card. In the JSX where the New Request tab content is rendered (around the `submittedSummary ? <Card>...</Card> : <Card>...<SurgeryRequestForm/></Card>` ternary), ABOVE that ternary, add:

```tsx
{draftBanner && (
  <div
    className="mb-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-3"
    data-testid="draft-restore-banner"
  >
    <div className="flex-1 min-w-0">
      <div className="font-medium">{tFn("draft.banner.title")}</div>
      <div className="text-xs opacity-80">
        {tFn("draft.banner.savedAgo").replace(
          "{when}",
          formatDistanceToNow(new Date(draftBanner.savedAt), {
            locale: lang === "de" ? deLocale : enLocale,
          }),
        )}
      </div>
    </div>
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setRestoredInitialValues(
          draftBanner.values as unknown as SurgeryRequestFormValues,
        );
        setDraftBanner(null);
      }}
      data-testid="button-draft-restore"
    >
      {tFn("draft.banner.restore")}
    </Button>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (me?.email) clearDraft(token, me.email);
        setDraftBanner(null);
      }}
      data-testid="button-draft-discard"
    >
      {tFn("draft.banner.discard")}
    </Button>
  </div>
)}
```

(Confirm `formatDistanceToNow` and the German locale `deLocale` from `date-fns` are already imported at the top of the file. If not, add: `import { formatDistanceToNow } from "date-fns";` and `import { de as deLocale, enUS as enLocale } from "date-fns/locale";`. The file already uses `date-fns` for calendar formatting — verify by reading the existing imports.)

**4f)** Pass the new props into `<SurgeryRequestForm>`:

```tsx
<SurgeryRequestForm
  ...existing props...
  initialValues={restoredInitialValues}
  onValuesChange={handleFormChange}
/>
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx tests/surgeon-portal-draft.test.ts`
Expected: ALL tests PASS.

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        client/src/pages/SurgeonPortal.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): auto-save draft + restore banner

Wire the localStorage draft module into the surgery request flow.
Form values are saved 800ms after the last change, scoped per
portal token + surgeon email. On reopen, if a draft exists, an
amber banner offers Restore (rehydrate) or Discard (delete);
form starts blank either way until the user picks one. Drafts are
cleared on successful submit.

The form receives a new optional onValuesChange callback so the
page can observe values without lifting state ownership.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final smoke test + verification

**Files:**
- None to modify. Verification only.

- [ ] **Step 1: Run the full surgery-request test suite**

Run: `npx vitest run tests/surgery-request-form.test.tsx tests/surgeon-portal-draft.test.ts`
Expected: ALL PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Browser smoke**

Run: `npm run dev`. Open the surgeon portal and verify:

1. Sticky progress header is visible at the top of the form card. 4 dots in default mode; the active dot changes when you click Continue.
2. Scroll down a long Step 2 — the header stays pinned.
3. Toggle "Reserve only" — the header now shows 2 dots and "Step N of 2".
4. Type a few values (surgery name, date, etc.) — wait 1 second, refresh the tab — the restore banner appears: "Continuing your previous draft, saved a few seconds ago".
5. Click "Restore" — the banner disappears and your prior values are reloaded.
6. Click "Discard" on a fresh draft — banner disappears, localStorage entry is gone (verify in DevTools).
7. On a phone-sized window: date+duration stack vertically, switch rows are tappable across their full width, the duration input shows the numeric keyboard.
8. Submit a complete request → verify the draft is cleared from localStorage.
9. Switch language to English — verify all 5 new keys render in English.

- [ ] **Step 4: Final commit if any cleanup needed**

If there's nothing left to commit:
```bash
git status
```
Expected: clean tree.

If smoke surfaced a bug, fix it inline and commit.

---

## Self-review checklist (run after writing the plan)

- [x] Spec coverage: Tasks 1–6 cover all 3 spec changes plus i18n and verification. Phase 3 items remain explicitly out of scope.
- [x] No placeholders: every step has actual code or an exact decision rule.
- [x] Type consistency: `SurgerySnapshot` (draft module's opaque value type) and `SurgeryRequestFormValues` (form's internal type) are bridged via `as unknown as` casts at the page boundary — documented and consistent.
- [x] `SECTION_TITLE_KEY` table covers all `SectionKey` values (surgeon, surgery, patient, documents) — verified.
- [x] All new i18n keys (Task 1) are referenced by later tasks; no new key referenced that wasn't added.
- [x] `formatDistanceToNow` import — Task 5 confirms it's already available in the file or adds the import explicitly. Locale imports (`de`, `enUS`) handled the same way.
