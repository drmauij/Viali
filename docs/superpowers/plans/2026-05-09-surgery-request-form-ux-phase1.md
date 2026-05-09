# Surgery Request Form UX Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six UX improvements to the in-portal surgery-request form (`SurgeryRequestForm`) — surgeon summary card on Step 1, reservation toggle moved to Step 2, sub-grouped Step 2, cleaned-up CHOP picker, inline field validation, and a "missing fields" callout above Continue/Submit.

**Architecture:** Single React component (`client/src/components/surgery/SurgeryRequestForm.tsx`) gets a new optional `currentSurgeon` prop and additional internal state for `chopMode`, `touched`, and per-field validity. Its parent (`client/src/pages/SurgeonPortal.tsx`) loads `phone` from `/me` and threads `currentSurgeon` through. The backend route `GET /api/surgeon-portal/:token/me` adds one field (`phone`). Eight new i18n keys land in both DE and EN dictionaries.

**Tech Stack:** React + TypeScript, TanStack Query, Radix Accordion, Tailwind, Vitest + @testing-library/react with jsdom env. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-09-surgery-request-form-ux-phase1-design.md`

---

## File map

- **Modify** `client/src/components/surgery/SurgeryRequestForm.tsx` — main component (every UI change)
- **Modify** `client/src/pages/SurgeonPortal.tsx` — i18n dictionaries (8 keys × 2 locales) + `me` query type + `currentSurgeon` prop pass-through
- **Modify** `server/routes/surgeonPortal.ts` — `GET /:token/me` returns `phone` (1 line)
- **Create** `tests/surgery-request-form.test.tsx` — component tests covering all 6 changes

---

## Task 1: Add i18n keys

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`

The form receives translations via a `t(key)` callback prop. We add 8 new keys to the DE and EN dictionaries inside `SurgeonPortal.tsx`. Subsequent tasks reference these keys, so we add them first.

- [ ] **Step 1: Add 8 keys to the German (`de`) dictionary**

Open `client/src/pages/SurgeonPortal.tsx`. Find the `de` dictionary block (around line 100–174, ends at `"documents.uploadDisabled": "Datei-Upload ist in dieser Ansicht nicht verfügbar.",`).

Insert these keys before the closing `}` of the `de` block (place them logically next to related keys; exact placement does not matter functionally):

```ts
    // Phase 1 UX additions
    "surgeonCard.submittingAs": "absendend als",
    "chopSearch.useFreeText": "Freien Text eingeben",
    "chopSearch.backToSearch": "Zurück zur Suche",
    "validation.required": "Pflichtfeld",
    "missingFields": "Noch erforderlich",
    "subgroup.schedule": "Termin",
    "subgroup.procedure": "Eingriff",
    "subgroup.coverage": "Abrechnung",
```

- [ ] **Step 2: Add the same 8 keys to the English (`en`) dictionary**

Find the `en` dictionary block (starts at line ~175). Insert before its closing `}`:

```ts
    // Phase 1 UX additions
    "surgeonCard.submittingAs": "submitting as",
    "chopSearch.useFreeText": "Use custom name",
    "chopSearch.backToSearch": "Back to search",
    "validation.required": "Required",
    "missingFields": "Still required",
    "subgroup.schedule": "Schedule",
    "subgroup.procedure": "Procedure",
    "subgroup.coverage": "Coverage",
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — no type errors. (The `tFn` callback passes string keys through; new keys don't change the type.)

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SurgeonPortal.tsx
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): add Phase 1 UX i18n keys

Adds 8 translation keys (DE + EN) for the upcoming surgery-request
form Phase 1 UX work: surgeon card label, CHOP picker mode toggle,
inline validation message, missing-fields callout, and three
sub-group labels (schedule / procedure / coverage).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend `/me` endpoint returns `phone`

**Files:**
- Modify: `server/routes/surgeonPortal.ts:570-577`

The form needs the surgeon's phone number to render the summary card. `users.phone` already exists in the DB; we just expose it.

- [ ] **Step 1: Add `phone` to the `/me` response**

Open `server/routes/surgeonPortal.ts`. Find the `/me` route (around line 558). Modify the `res.json` block:

Before:
```ts
res.json({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  isPraxis: u.isPraxis,
});
```

After:
```ts
res.json({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  phone: u.phone,
  isPraxis: u.isPraxis,
});
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/routes/surgeonPortal.ts
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): /me returns phone number

Surface users.phone via GET /api/surgeon-portal/:token/me so the
in-portal request form can render a surgeon summary card on Step 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Surgeon summary card on Step 1

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx` — add `currentSurgeon` prop + render card
- Modify: `client/src/pages/SurgeonPortal.tsx` — extend `me` query type, pass `currentSurgeon`
- Create: `tests/surgery-request-form.test.tsx` — first test: card renders when picker hidden

This task introduces the test file. Subsequent tasks add to the same file.

- [ ] **Step 1: Create the test file with a card-render test**

Create `tests/surgery-request-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SurgeryRequestForm } from "../client/src/components/surgery/SurgeryRequestForm";

const t = (key: string) => key;

const baseProps = {
  availableSurgeons: [{ id: "u1", firstName: "Roman", lastName: "Skoblo" }],
  selectedSurgeonId: "u1",
  onSelectedSurgeonIdChange: () => {},
  showSurgeonPicker: false,
  showSurgeonDetailsBlock: false,
  t,
  locale: "de" as const,
  onSubmit: () => {},
  isSubmitting: false,
};

describe("SurgeryRequestForm — surgeon summary card", () => {
  it("renders the surgeon summary card when picker is hidden and currentSurgeon is provided", () => {
    render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{
          firstName: "Roman",
          lastName: "Skoblo",
          email: "roman@example.com",
          phone: "+41 79 123 45 67",
        }}
      />,
    );
    expect(screen.getByText(/Roman Skoblo/)).toBeTruthy();
    expect(screen.getByText(/roman@example.com/)).toBeTruthy();
    expect(screen.getByText(/\+41 79 123 45 67/)).toBeTruthy();
    expect(screen.getByText(/surgeonCard.submittingAs/)).toBeTruthy();
  });

  it("does not render the summary card when the picker is visible", () => {
    render(
      <SurgeryRequestForm
        {...baseProps}
        showSurgeonPicker={true}
        currentSurgeon={{
          firstName: "Roman",
          lastName: "Skoblo",
          email: "roman@example.com",
          phone: "+41 79 123 45 67",
        }}
      />,
    );
    expect(screen.queryByText(/surgeonCard.submittingAs/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "surgeon summary card"`
Expected: FAIL — `currentSurgeon` is not yet a prop, and the card doesn't render.

- [ ] **Step 3: Add `currentSurgeon` prop + card render to SurgeryRequestForm**

Open `client/src/components/surgery/SurgeryRequestForm.tsx`. In the `SurgeryRequestFormProps` interface (around line 124), add:

```ts
  /**
   * Read-only summary of the authenticated surgeon. When provided AND
   * `showSurgeonPicker` is false, renders an identification card on Step 1
   * in place of the (hidden) picker. The form does not use this for any
   * mutable state — submission still uses `selectedSurgeonId`.
   */
  currentSurgeon?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
```

Add `currentSurgeon` to the destructured props in the component signature (around line 212–223):

```ts
export function SurgeryRequestForm({
  availableSurgeons,
  selectedSurgeonId,
  onSelectedSurgeonIdChange,
  showSurgeonPicker,
  showSurgeonDetailsBlock,
  currentSurgeon,
  t,
  onSubmit,
  isSubmitting,
  initialValues,
  uploadFile,
}: SurgeryRequestFormProps) {
```

Inside `AccordionItem value="surgeon"` → `AccordionContent` → the `<div className="space-y-4 pt-2">` (around line 416), add the card rendering immediately AFTER the existing `{showSurgeonPicker && ...}` block and BEFORE `{showSurgeonDetailsBlock && ...}`:

```tsx
{!showSurgeonPicker && currentSurgeon && (
  <div
    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
    data-testid="surgeon-summary-card"
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
      {`${(currentSurgeon.lastName ?? "").trim()[0] ?? ""}${(currentSurgeon.firstName ?? "").trim()[0] ?? ""}`.toUpperCase() || "—"}
    </div>
    <div className="min-w-0 flex-1 text-sm leading-snug">
      <div className="truncate font-medium">
        {[currentSurgeon.firstName, currentSurgeon.lastName].filter(Boolean).join(" ")}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {[currentSurgeon.email, currentSurgeon.phone].filter(Boolean).join(" · ")}
      </div>
    </div>
    <div className="hidden sm:block text-[10px] uppercase tracking-wider text-muted-foreground">
      {t("surgeonCard.submittingAs")}
    </div>
  </div>
)}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "surgeon summary card"`
Expected: PASS for both card cases.

- [ ] **Step 5: Wire `currentSurgeon` from SurgeonPortal**

Open `client/src/pages/SurgeonPortal.tsx`. Find the `me` query (around line 769–777). Update the type to include `phone`:

```ts
const { data: me } = useQuery<{
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  isPraxis: boolean;
}>({
  queryKey: [`/api/surgeon-portal/${token}/me`],
});
```

Then find the `<SurgeryRequestForm ... />` JSX (around line 1179–1190). Add the `currentSurgeon` prop:

```tsx
<SurgeryRequestForm
  availableSurgeons={availableSurgeons}
  selectedSurgeonId={selectedSurgeonId}
  onSelectedSurgeonIdChange={setSelectedSurgeonId}
  showSurgeonPicker={showSurgeonPicker}
  showSurgeonDetailsBlock={false}
  currentSurgeon={
    me
      ? {
          firstName: me.firstName,
          lastName: me.lastName,
          email: me.email,
          phone: me.phone,
        }
      : undefined
  }
  t={tFn}
  locale={lang === "de" ? "de" : "en"}
  onSubmit={(values) => submitRequest.mutate(values)}
  isSubmitting={submitRequest.isPending}
  uploadFile={uploadFile}
/>
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        client/src/pages/SurgeonPortal.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): step 1 surgeon summary card

When the operating-surgeon picker is hidden (single surgeon, or a
praxis with no children), render a read-only summary card with
avatar initials, name, email · phone, and a "submitting as" tag.
Replaces the previously empty Step 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Move "Reserve only" toggle to top of Step 2

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

The toggle currently sits in Step 1 (around line 485–500). It's a scope decision (is the patient block needed?) so it belongs in Step 2.

- [ ] **Step 1: Add the failing test**

Append to `tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — reservation toggle placement", () => {
  it("renders the reservation switch inside the surgery (step 2) section, not the surgeon section", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{
          firstName: "R",
          lastName: "S",
          email: "r@example.com",
          phone: "+41 79 000 00 00",
        }}
      />,
    );
    const surgeonSection = container.querySelector('[data-state][data-orientation="vertical"] [data-radix-collection-item][value="surgeon"]')
      ?? container.querySelector('[data-testid="accordion-section-surgeon"]');
    const surgerySection = container.querySelector('[data-testid="accordion-section-surgery"]');

    // Easier: just check the toggle is now inside an element marked as the surgery section.
    const toggle = container.querySelector('[data-testid="switch-reservation-only"]');
    expect(toggle).not.toBeNull();
    // The toggle's nearest ancestor with data-section should be "surgery"
    const ancestorSection = toggle?.closest('[data-section]')?.getAttribute("data-section");
    expect(ancestorSection).toBe("surgery");
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "reservation toggle placement"`
Expected: FAIL — toggle is still in the surgeon section, and `data-section` markers don't yet exist.

- [ ] **Step 3: Add `data-section` markers and move the toggle**

In `client/src/components/surgery/SurgeryRequestForm.tsx`:

1. Find the surgeon `AccordionContent` (around line 415). Wrap its inner div with a `data-section` attribute. Change:

```tsx
<AccordionContent>
  <div className="space-y-4 pt-2">
```

to:

```tsx
<AccordionContent>
  <div className="space-y-4 pt-2" data-section="surgeon">
```

2. Apply the same pattern to the surgery, patient, and documents `AccordionContent` blocks (search for the four `<div className="space-y-4 pt-2">` wrappers — there should be exactly one per section).

3. Delete the toggle from the surgeon section (the entire `<div className="flex items-center justify-between p-3 rounded-lg border border-border">` block containing `id="reservationOnly"`, around line 485–500).

4. Add the toggle as the first element inside the **surgery** section's `data-section="surgery"` div, with the new highlighted-card styling. Insert this immediately after the opening `<div className="space-y-4 pt-2" data-section="surgery">`:

```tsx
<div className="flex items-center justify-between p-3 rounded-lg border border-primary/40 bg-primary/5">
  <div className="pr-3">
    <Label htmlFor="reservationOnly" className="cursor-pointer font-medium">
      {t("reservationOnly")}
    </Label>
    <p className="text-xs text-muted-foreground mt-0.5">
      {t("reservationOnlyDesc")}
    </p>
  </div>
  <Switch
    id="reservationOnly"
    checked={values.isReservationOnly}
    onCheckedChange={(checked) => update("isReservationOnly", checked)}
    data-testid="switch-reservation-only"
  />
</div>
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "reservation toggle placement"`
Expected: PASS.

- [ ] **Step 5: Run all form tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Expected: all tests PASS.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): move reservation toggle to step 2

Reservation-only is a scope decision about what's submitted, not a
surgeon decision. Move the switch from Step 1 ("Operating surgeon")
to the top of Step 2 ("Surgery & schedule"), restyled as a
primary-tinted info box. data-section attributes added to each
accordion content for component-level test isolation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Section 2 sub-groups (Termin / Eingriff / Abrechnung)

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

Wrap the existing fields inside Section 2 in three labeled visual bands. No accordion-within-accordion; just dimmed uppercase labels.

- [ ] **Step 1: Add the failing test**

Append to `tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — section 2 sub-groups", () => {
  it("renders three labeled groups inside the surgery section", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{
          firstName: "R",
          lastName: "S",
          email: "r@example.com",
          phone: null,
        }}
      />,
    );
    const surgery = container.querySelector('[data-section="surgery"]');
    expect(surgery).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="schedule"]')).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="procedure"]')).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="coverage"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "sub-groups"`
Expected: FAIL — no `data-subgroup` markers yet.

- [ ] **Step 3: Wrap fields in three subgroup divs**

In `client/src/components/surgery/SurgeryRequestForm.tsx`, inside the surgery `AccordionContent`'s `<div data-section="surgery">`:

After the reservation toggle (just added in Task 4), add the **schedule** group containing `wishedDate`, `surgeryDurationMinutes`, and the time-range slider. Wrap in:

```tsx
<div data-subgroup="schedule" className="space-y-3 pt-2">
  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
    {t("subgroup.schedule")}
  </div>
  {/* existing wishedDate + duration grid here */}
  {/* existing time-range slider block here */}
</div>
```

The existing date/duration grid lives at lines ~649–672 and the time-range slider at ~673–696 (per the spec). Move these two blocks into the schedule subgroup div.

After schedule, add the **procedure** group wrapping the CHOP search, surgery side, patient position fields, and antibiotic prophylaxis switch. Each of these is currently gated by `!values.isReservationOnly`. Keep that conditional **inside** the wrapping div so the group label still shows in reservation-only mode IF any field renders — but since all four are reservation-gated, render the entire group conditional on `!values.isReservationOnly`:

```tsx
{!values.isReservationOnly && (
  <div data-subgroup="procedure" className="space-y-3 pt-2">
    <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
      {t("subgroup.procedure")}
    </div>
    {/* surgery name (CHOP) block */}
    {/* surgery side block */}
    {/* PatientPositionFields */}
    {/* antibiotic prophylaxis switch */}
  </div>
)}
```

After procedure, add the **coverage** group:

```tsx
{!values.isReservationOnly && (
  <div data-subgroup="coverage" className="space-y-3 pt-2">
    <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
      {t("subgroup.coverage")}
    </div>
    {/* coverageType */}
    {/* stayType */}
    {/* diagnosis */}
    {/* withAnesthesia switch */}
    {/* anesthesiaNotes (only when withAnesthesia) */}
  </div>
)}
```

`surgeryNotes` (textarea) stays **outside** any subgroup, at the end of the section content (before the Continue button).

Remove the existing `!values.isReservationOnly` conditional that wraps each individual field that's now inside `procedure` or `coverage` (since the wrapping group already gates them) — but **leave** the inner conditionals alone if they have additional logic (e.g. `coverageType === "Krankenkasse"` for `diagnosis *`, `values.withAnesthesia` for `anesthesiaNotes`).

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "sub-groups"`
Expected: PASS.

- [ ] **Step 5: Run all form tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Run: `npm run check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): sub-group step 2 (schedule/procedure/coverage)

Step 2 is dense — 11+ fields stacked. Wrap them in three labeled
visual bands (Termin / Eingriff / Abrechnung) prefaced by a small
uppercase label. surgeryNotes stays outside any group as a
catch-all field at the bottom.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CHOP picker cleanup

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

Today's UI shows both the CHOP combobox AND a free-text `<Input>`. Collapse to one entry point with a toggle link.

- [ ] **Step 1: Add the failing test**

Append to `tests/surgery-request-form.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

describe("SurgeryRequestForm — CHOP picker cleanup", () => {
  it("defaults to combobox mode and toggles to custom-text input on click", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
    );
    // Default: combobox visible, plain custom input not visible
    expect(container.querySelector('[data-testid="button-chop-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="input-surgery-name-custom"]')).toBeNull();

    // Click "Use custom name"
    const link = screen.getByText("chopSearch.useFreeText");
    fireEvent.click(link);

    expect(container.querySelector('[data-testid="button-chop-search"]')).toBeNull();
    expect(container.querySelector('[data-testid="input-surgery-name-custom"]')).not.toBeNull();

    // Click "Back to search" — combobox restored
    const back = screen.getByText("chopSearch.backToSearch");
    fireEvent.click(back);
    expect(container.querySelector('[data-testid="button-chop-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="input-surgery-name-custom"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "CHOP picker"`
Expected: FAIL — there's no toggle yet.

- [ ] **Step 3: Add `chopMode` state and conditional render**

In `client/src/components/surgery/SurgeryRequestForm.tsx`, near the existing CHOP search state (`chopOpen`, `chopQuery` around line 335–337), add:

```ts
const [chopMode, setChopMode] = useState<"search" | "custom">("search");
```

Find the surgery-name block (currently the popover button + the free-text `<Input>` below it, around lines 528–595). Replace the entire `<div className="space-y-2">{...}</div>` containing both controls with:

```tsx
<div className="space-y-2">
  <Label>{t("surgeryName")} *</Label>

  {chopMode === "search" ? (
    <>
      <Popover open={chopOpen} onOpenChange={setChopOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
            data-testid="button-chop-search"
          >
            <span className="truncate text-left">
              {values.surgeryName || t("chopSearch.placeholder")}
              {values.chopCode && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {values.chopCode}
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[420px]" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("chopSearch.placeholder")}
              value={chopQuery}
              onValueChange={setChopQuery}
            />
            <CommandList className="max-h-[300px] overflow-auto">
              <CommandEmpty>
                {chopQuery.trim().length < 2
                  ? t("chopSearch.typeMore")
                  : t("chopSearch.empty")}
              </CommandEmpty>
              <CommandGroup>
                {chopResults.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      update("surgeryName", c.descriptionDe);
                      update("chopCode", c.code);
                      setChopOpen(false);
                    }}
                    data-testid={`chop-option-${c.code}`}
                  >
                    <span className="font-mono text-xs mr-2 text-muted-foreground">
                      {c.code}
                    </span>
                    <span>{c.descriptionDe}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => setChopMode("custom")}
      >
        + {t("chopSearch.useFreeText")}
      </button>
    </>
  ) : (
    <>
      <Input
        placeholder={t("chopSearch.useCustom")}
        value={values.surgeryName}
        onChange={(e) => {
          update("surgeryName", e.target.value);
          update("chopCode", "");
        }}
        data-testid="input-surgery-name-custom"
      />
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => {
          // custom → search: clear typed name unless it came from a CHOP match
          if (!values.chopCode) {
            update("surgeryName", "");
          }
          setChopMode("search");
        }}
      >
        ← {t("chopSearch.backToSearch")}
      </button>
    </>
  )}
</div>
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "CHOP picker"`
Expected: PASS.

- [ ] **Step 5: Run all form tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Run: `npm run check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): collapse CHOP picker to a single entry point

Today's UI shows the CHOP combobox AND a parallel free-text input —
two ways to do the same thing. Collapse to one: combobox by default,
"+ Use custom name" link below switches to a plain text input,
"Back to search" link restores. Custom-typed names that didn't come
from a CHOP match are cleared on switch-back so the surgeon starts
fresh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Inline field validation (touched + on-blur)

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

Add per-field touched tracking, expose per-field validity, and render `aria-invalid` + a `Pflichtfeld` helper text when a required field is touched-and-empty.

- [ ] **Step 1: Add the failing test**

Append to `tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — inline validation", () => {
  it("shows 'Required' on a date field after blur when empty, clears once filled", async () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
    );
    // Open Step 2 by clicking the surgery accordion trigger
    const trigger = screen.getAllByRole("button").find((b) => b.textContent?.includes("accordion.surgery"));
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);

    // Find date input by data-testid
    const dateInput = container.querySelector('[data-testid="input-wished-date"]') as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();

    // No error before blur
    expect(dateInput!.getAttribute("aria-invalid")).not.toBe("true");

    // Blur with empty value → error appears
    fireEvent.blur(dateInput!);
    expect(dateInput!.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText("validation.required").length).toBeGreaterThan(0);

    // Type a valid value → error clears
    fireEvent.change(dateInput!, { target: { value: "2026-06-01" } });
    expect(dateInput!.getAttribute("aria-invalid")).not.toBe("true");
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "inline validation"`
Expected: FAIL — no touched tracking, no aria-invalid wiring.

- [ ] **Step 3: Add per-field validity + touched tracking**

In `client/src/components/surgery/SurgeryRequestForm.tsx`, add a touched-field set and a per-field validity map next to `sectionValidity` (around line 243):

```ts
type FieldKey =
  | "selectedSurgeonId"
  | "wishedDate"
  | "surgeryDurationMinutes"
  | "surgeryName"
  | "coverageType"
  | "stayType"
  | "diagnosis"
  | "patientFirstName"
  | "patientLastName"
  | "patientBirthday"
  | "patientPhone"
  | "patientStreet"
  | "patientPostalCode"
  | "patientCity";

const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
const markTouched = (k: FieldKey) =>
  setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));

// Per-field validity. Mirrors the rules already in sectionValidity.
const fieldValid = useMemo<Record<FieldKey, boolean>>(() => {
  const reservation = values.isReservationOnly;
  return {
    selectedSurgeonId: !showSurgeonPicker || !!selectedSurgeonId,
    wishedDate: !!values.wishedDate,
    surgeryDurationMinutes:
      values.surgeryDurationMinutes >= 5 && values.surgeryDurationMinutes <= 720,
    surgeryName: reservation ? true : !!values.surgeryName,
    coverageType: reservation ? true : !!values.coverageType,
    stayType: reservation ? true : !!values.stayType,
    diagnosis:
      reservation || values.coverageType !== "Krankenkasse"
        ? true
        : !!values.diagnosis,
    patientFirstName: reservation ? true : !!values.patientFirstName,
    patientLastName: reservation ? true : !!values.patientLastName,
    patientBirthday: reservation ? true : !!values.patientBirthday,
    patientPhone: reservation ? true : !!values.patientPhone,
    patientStreet: reservation ? true : !!values.patientStreet,
    patientPostalCode: reservation ? true : !!values.patientPostalCode,
    patientCity: reservation ? true : !!values.patientCity,
  };
}, [values, selectedSurgeonId, showSurgeonPicker]);

const showError = (k: FieldKey) => touched.has(k) && !fieldValid[k];
```

Then for each required field in the JSX, add `onBlur={() => markTouched("<field>")}`, set `aria-invalid={showError("<field>")}`, add a conditional className with `border-destructive` when invalid, and render an error helper. Example for `wishedDate`:

```tsx
<div className="space-y-2">
  <Label htmlFor="wishedDate">{t("wishedDate")} *</Label>
  <DateInput
    value={values.wishedDate}
    onChange={(v) => update("wishedDate", v)}
    onBlur={() => markTouched("wishedDate")}
    aria-invalid={showError("wishedDate") || undefined}
    className={showError("wishedDate") ? "border-destructive" : undefined}
    data-testid="input-wished-date"
  />
  {showError("wishedDate") && (
    <p className="text-xs text-destructive">{t("validation.required")}</p>
  )}
</div>
```

Repeat the same shape (`onBlur` + `aria-invalid` + conditional `border-destructive` className + `<p className="text-xs text-destructive">` helper) for every required field in the form: `surgeryDurationMinutes`, `surgeryName` (both `chopMode` branches), `coverageType` (Select trigger), `stayType` (Select trigger), `diagnosis` (only when coverage is Krankenkasse), and the seven patient fields. For Selects, attach `onBlur` to the `SelectTrigger`. For `PhoneInputWithCountry`, pass `onBlur` if supported; if not, add `markTouched` in `onChange` after a non-empty value (acceptable equivalence — phone entries don't blur in a usual sense).

If `DateInput`/`FlexibleDateInput`/`PhoneInputWithCountry` don't accept `onBlur`/`aria-invalid` props, adapt by wrapping the input in a `<div onBlur={...}>` (event bubbles from inner native inputs). Keep changes minimal: prefer the prop pass-through if the component already forwards them.

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "inline validation"`
Expected: PASS.

- [ ] **Step 5: Run all form tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Run: `npm run check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): inline validation on required fields

Track per-field touched state. Once a required field is blurred
empty, render a red border + 'Pflichtfeld' helper text and set
aria-invalid. Clears on next valid input. Validity rules mirror
the existing sectionValidity logic — no rule changes, just
field-level surfacing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: "Missing fields" callout above Continue / Submit

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`
- Modify: `tests/surgery-request-form.test.tsx`

Reuse the `fieldValid` map from Task 7 to compute names of missing required fields. Render an amber callout above each invalid Continue button (per-section) and above Submit (across all visible sections). Continue/Submit clicks also mark all relevant required fields as touched.

- [ ] **Step 1: Add the failing test**

Append to `tests/surgery-request-form.test.tsx`:

```tsx
describe("SurgeryRequestForm — missing-fields callout", () => {
  it("shows the amber callout listing missing fields when Continue is clicked on an invalid section", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
    );
    // Open Step 2
    const trigger = screen.getAllByRole("button").find((b) => b.textContent?.includes("accordion.surgery"));
    fireEvent.click(trigger!);

    // Click Continue with all required fields empty
    const cont = container.querySelector('[data-testid="button-continue-surgery"]') as HTMLButtonElement;
    expect(cont).not.toBeNull();
    fireEvent.click(cont);

    // Callout appears, listing missing field labels
    const callout = container.querySelector('[data-testid="missing-fields-callout-surgery"]');
    expect(callout).not.toBeNull();
    // Should list at least surgery name, coverage type, stay type, wished date, duration
    expect(callout!.textContent).toContain("missingFields");
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "missing-fields callout"`
Expected: FAIL — callout doesn't render yet.

- [ ] **Step 3: Compute missing-field labels and render callout**

In `client/src/components/surgery/SurgeryRequestForm.tsx`, add a helper near `fieldValid` (Task 7):

```ts
const FIELD_LABEL_KEY: Record<FieldKey, string> = {
  selectedSurgeonId: "operatingSurgeon",
  wishedDate: "wishedDate",
  surgeryDurationMinutes: "durationMinutes",
  surgeryName: "surgeryName",
  coverageType: "coverageType",
  stayType: "stayType",
  diagnosis: "diagnosis",
  patientFirstName: "firstName",
  patientLastName: "lastName",
  patientBirthday: "birthday",
  patientPhone: "phone",
  patientStreet: "street",
  patientPostalCode: "postalCode",
  patientCity: "city",
};

const FIELDS_BY_SECTION: Record<SectionKey, FieldKey[]> = {
  surgeon: ["selectedSurgeonId"],
  surgery: [
    "wishedDate",
    "surgeryDurationMinutes",
    "surgeryName",
    "coverageType",
    "stayType",
    "diagnosis",
  ],
  patient: [
    "patientFirstName",
    "patientLastName",
    "patientBirthday",
    "patientPhone",
    "patientStreet",
    "patientPostalCode",
    "patientCity",
  ],
  documents: [],
};

const missingFieldLabels = (section: SectionKey | "all"): string[] => {
  const keys =
    section === "all"
      ? visibleSections.flatMap((s) => FIELDS_BY_SECTION[s])
      : FIELDS_BY_SECTION[section];
  return keys.filter((k) => !fieldValid[k]).map((k) => t(FIELD_LABEL_KEY[k]));
};

const touchAllInSection = (section: SectionKey) => {
  setTouched((prev) => {
    const next = new Set(prev);
    for (const k of FIELDS_BY_SECTION[section]) next.add(k);
    return next;
  });
};

const touchAllVisible = () => {
  setTouched((prev) => {
    const next = new Set(prev);
    for (const s of visibleSections) for (const k of FIELDS_BY_SECTION[s]) next.add(k);
    return next;
  });
};
```

Update `advanceFrom` (around line 322) so it marks all the current section's fields as touched before advancing — that way clicking Continue on an invalid section lights up every required field, not just the touched ones:

```ts
const advanceFrom = (current: SectionKey) => {
  if (!sectionValidity[current]) {
    touchAllInSection(current);
    return; // stay on this section so the callout + per-field errors show
  }
  const i = visibleSections.indexOf(current);
  for (let j = i + 1; j < visibleSections.length; j++) {
    const k = visibleSections[j];
    if (!sectionValidity[k]) {
      setOpenSection(k);
      return;
    }
  }
  if (i + 1 < visibleSections.length) setOpenSection(visibleSections[i + 1]);
};
```

(Remove `disabled={!sectionValidity.X}` from each Continue button — letting the click fire and surface errors is the new UX. Submit stays disabled when invalid.)

Replace each Continue button block (currently `<div className="flex justify-end"><Button .../></div>`) with a wrapper that includes the callout. Example for the `surgery` section:

```tsx
{!isLastVisible("surgery") && (
  <>
    {!sectionValidity.surgery && missingFieldLabels("surgery").length > 0 && touched.size > 0 && (
      <div
        className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
        data-testid="missing-fields-callout-surgery"
      >
        <span className="font-medium">{t("missingFields")}:</span>{" "}
        {missingFieldLabels("surgery").join(", ")}
      </div>
    )}
    <div className="flex justify-end">
      <Button
        type="button"
        onClick={() => advanceFrom("surgery")}
        data-testid="button-continue-surgery"
      >
        {t("accordion.continue")}
      </Button>
    </div>
  </>
)}
```

Note the visibility rule for the callout: `!sectionValidity.surgery && missingFieldLabels("surgery").length > 0 && touched.size > 0`. Wrapping the visibility on `touched.size > 0` ensures the callout doesn't appear on first render — it only appears after the user interacts (blurs a field or clicks Continue). The fail-fast test in Step 1 clicks Continue first, which calls `touchAllInSection`, so `touched.size > 0` is satisfied.

Repeat the same wrap for `surgeon` and `patient` Continue buttons. (The `documents` section is optional and has no Continue — skip.)

For the **Submit** button at the bottom of the form (around line 994), wrap similarly with an "all sections" callout:

```tsx
<div className="flex flex-col gap-2 pt-2">
  {!canSubmit && missingFieldLabels("all").length > 0 && touched.size > 0 && (
    <div
      className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
      data-testid="missing-fields-callout-submit"
    >
      <span className="font-medium">{t("missingFields")}:</span>{" "}
      {missingFieldLabels("all").join(", ")}
    </div>
  )}
  <div className="flex justify-end">
    <Button
      type="submit"
      disabled={!canSubmit || isSubmitting}
      data-testid="button-submit-surgery-request"
    >
      {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
      {t("submit")}
    </Button>
  </div>
</div>
```

Update the `handleSubmit` (around line 293) to mark all visible required fields as touched if the form isn't valid, so that clicking a (still-enabled-on-Enter-key) Submit reveals everything:

```ts
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!canSubmit) {
    touchAllVisible();
    return;
  }
  if (isSubmitting) return;
  await onSubmit(values);
};
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npx vitest run tests/surgery-request-form.test.tsx -t "missing-fields callout"`
Expected: PASS.

- [ ] **Step 5: Run all form tests + typecheck**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Run: `npm run check`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx \
        tests/surgery-request-form.test.tsx
git commit -m "$(cat <<'EOF'
feat(surgery-request): missing-fields callout above Continue/Submit

Replace silent Continue/Submit with an amber callout listing the
required fields still empty. Clicking Continue on an invalid
section now marks all that section's required fields as touched,
so per-field errors light up alongside the callout. Submit
behaves the same across all visible sections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual smoke test + final verification

**Files:**
- None to modify. Verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all PASS. If anything else failed, fix before moving on.

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Start dev server and verify in browser**

Run: `npm run dev`

Open the surgeon portal and:

1. Log in as a non-praxis surgeon. Confirm Step 1 shows the surgeon summary card with avatar initials, name, email · phone, and the "submitting as" tag.
2. Click Continue on Step 1 — it advances to Step 2.
3. Verify the "Reserve only" toggle sits at the top of Step 2 with the new tinted card style.
4. Verify the three sub-group labels (Termin / Eingriff / Abrechnung) appear inside Step 2.
5. Click Continue on Step 2 with empty required fields — verify the amber callout above Continue lists the missing fields and red borders + "Pflichtfeld" appear on each.
6. Type a valid value in one of the highlighted fields — the red border + helper text should clear.
7. Use the CHOP picker — verify default search mode + the "+ Use custom name" link toggles cleanly back and forth.
8. Toggle "Reserve only" — verify patient + documents accordions collapse out of view.
9. Submit a complete request end-to-end — verify it lands on the calendar/list as today.
10. Switch language to English — verify all 8 new keys render in English.
11. Log in as a **praxis** user with at least one child — verify Step 1 shows the picker (no card) and request submission works as before.

- [ ] **Step 4: Final commit if any cleanup needed**

If there's nothing left to commit:
```bash
git status
```
Expected: clean tree.

If smoke test surfaced a bug, fix it inline, add a regression test where reasonable, and commit.

---

## Self-review checklist (run after writing the plan)

- [x] Spec coverage: Tasks 1–9 cover all 6 spec changes plus i18n and verification. Phase 2/3 items remain explicitly out of scope.
- [x] No placeholders ("TBD", "TODO", "implement later") — every step has actual code.
- [x] Type consistency: `currentSurgeon` shape matches between SurgeryRequestForm props (Task 3), the SurgeonPortal `me` query type (Task 3 step 5), and the backend response (Task 2).
- [x] `FieldKey` and `FIELD_LABEL_KEY` use the same set of keys — verified.
- [x] `data-section` and `data-subgroup` markers used by tests are defined in the production code in their respective tasks.
- [x] All new i18n keys (Task 1) are referenced by later tasks; no new key referenced that wasn't added.
