# Risk Grade — Surgery-Class Attenuation & Preliminary State

**Status:** Design (spec)
**Date:** 2026-05-14
**Branch:** `feat/risk-grade-attenuation`
**Worktree:** `/home/mau/viali/.worktrees/risk-grade-attenuation`
**Related:** builds on `docs/superpowers/specs/2026-05-13-perioperative-risk-grade-design.md` (the initial risk-grade design, now shipped on main).

---

## Problem & motivation

Two real-world clinician complaints surfaced after the initial perioperative risk-grade rollout:

1. **Age-driven overkill on small procedures.** An otherwise-healthy 82-year-old going in for a hernia gets flagged **HIGH** because the age-≥75 modifier bumps a baseline MED grade up one band. The same patient for a hip replacement landing at HIGH is clinically appropriate; for an outpatient hernia it is not. Today the engine is patient-centric only — the surgery class never pulls the grade down.
2. **Misleading "partial" grade before pre-op assessment.** The engine already runs on patient + surgery + questionnaire + assessment, but it ignores `questionnaire.conditions` entirely. So when a patient has filled the questionnaire (with structured illness checkboxes that share the same `hospital.illnessLists` items the pre-op assessment uses) but no anesthesia pre-op assessment exists yet, every comorbidity reads as `false`. The grade is rendered, but its inputs are wrong, and the UI gives no visual cue that this is a preliminary snapshot.

This spec addresses both in one cut.

---

## Section 1 — Scope & non-goals

**In scope:**

1. **Algorithm change** — suppress the age-≥75 grade bump when `surgeryRiskClass ∈ {minor, standard}`. All other behaviour unchanged: domain bands compute identically, drivers unchanged, surgery domain still LOW for minor/standard.
2. **Snapshot fields** — record `ageEligible`, `ageModifierSuppressed`, and `inputSource` in `perioperativeRisk` JSONB so the UI can render the suppressed-bump note and the Preliminary badge.
3. **Popover surfacing** — single info line under DOMAINS: either `ⓘ Age ≥75 bump suppressed (minor surgery)` or the existing amber `Age ≥ 75 — bumped up one band`. Mutually exclusive.
4. **Questionnaire → engine wiring** — `deriveRiskInputsFromRecords` projects `questionnaire.conditions` into the same per-organ-system shape the assessment uses (via each item's `category` from `hospital.illnessLists`), then layers assessment on top with per-key fall-through. Anesthetist's tick always wins; questionnaire fills the gaps.
5. **Preliminary badge** — when no anesthesia pre-op assessment exists yet (`inputSource !== "assessment"`), the risk chip renders with a dashed border and a `· ~` suffix; the popover gains a top amber line: *"ⓘ Preliminary — based on patient questionnaire (no anesthesia pre-op assessment yet)"*.
6. **Recompute trigger** — `recomputeRiskForPatientFutureSurgeries(patientId)` invoked on questionnaire submit and update.
7. **`/risk-methodology` rewrite** — new top section "How the final grade is calculated" with the pipeline, tiebreaker, attenuation rule, preliminary paragraph, and four worked examples.
8. **Backfill** — re-run `scripts/backfill-risk-grade.ts` on deploy to refresh `surgeries.riskGrade` and `surgeries.perioperativeRisk` with the new snapshot fields.
9. **i18n** — new translation keys in `riskMethodology.*`, `chip.*`, and `popover.*` namespaces. EN + DE only.
10. **Tests** — unit + component tests covering the algorithm, input derivation, popover lines, chip styling, and methodology page.

**Out of scope (separate specs):**

- Encounter-vs-patient dual-grade UX (Option C from the brainstorm — keep patient-axis HIGH visible alongside encounter ORANGE).
- Per-procedure attenuation tables or per-hospital toggle.
- Partial-assessment provenance per domain (`inputSource` is snapshot-level only).
- IT / ES / FR / ZH translations — folded into the existing translation-pass follow-up from the original risk-grade work.
- Localizing the methodology page beyond EN + DE (matches current state).

**Locked decisions:**

- **No hospital toggle** — always-on, per the no-addon-gates-by-default rule.
- **Snapshot-level provenance, not per-domain** — the chip and popover differentiate Preliminary vs Assessed; they do not surface "this specific domain came from questionnaire" subtitles.
- **Tilde + dashed border, not "Preliminary" inline text** — fits in calendar tile + PACU card + sticky header widths; full wording lives in tooltip and popover.

---

## Section 2 — Algorithm & data flow

### 2.1 Input derivation (`server/scoring/computePerioperativeRisk.ts`)

`deriveRiskInputsFromRecords` is the only function that needs algorithmic change. New flow:

```
1. Build organ-system maps from assessment (existing — heartIllnesses, lungIllnesses, …)
2. NEW: project questionnaire.conditions into the same organ-system shape using
        each item's `category` from hospital.illnessLists:
        projectQuestionnaireConditionsToOrganMaps(conditions, illnessLists)
        → { cardiovascular: {itemId: true|false}, pulmonary: {…}, … }
3. For each concept (CAD, COPD, VTE_HISTORY, …):
        const fromAssessment    = assessmentMap[itemId];      // undefined | true | false
        const fromQuestionnaire = questionnaireMap[itemId];
        concepts[CONCEPT] =
          fromAssessment    !== undefined ? fromAssessment :
          fromQuestionnaire !== undefined ? fromQuestionnaire :
          false;
4. BMI: bmiFromAssessment(assessment) ?? bmiFromQuestionnaire(questionnaire) ?? null
5. isCurrentSmoker, functionallyDependent, metAbove4: unchanged
   (already prefer questionnaire / fall back to assessment).
```

**Per-key fall-through, not per-form.** A half-filled assessment (heart filled, lungs untouched) doesn't drop questionnaire lung data — keys absent in the assessment map fall through to the questionnaire map.

New helper, colocated:

```ts
// server/scoring/projectQuestionnaireConditionsToOrganMaps.ts
export function projectQuestionnaireConditionsToOrganMaps(
  conditions: Record<string, { checked: boolean; notes?: string }> | null | undefined,
  illnessLists: HospitalIllnessLists,
): Record<OrganCategory, Record<string, boolean>>;
```

Skips items whose `category` is missing or unrecognized (defensive — guards against legacy list entries).

### 2.2 Provenance tracking

Derivation returns `inputSource` at the **snapshot level** (not per-domain):

```
if (any assessment organ-system map has at least one key)        → "assessment"
else if (questionnaire exists AND conditions/lifestyle non-empty) → "questionnaire"
else                                                              → "default"
```

`snapshot.partial = (inputSource !== "assessment")`. The two flags travel together but stay distinct so future work (partial-assessment merge state, Option C) can split them later.

### 2.3 Grade calculation (`shared/scoring/perioperativeRisk.ts:140-147`)

Only the age-modifier block changes:

```ts
const isLowRiskSurgery =
  i.surgeryRiskClass === "minor" || i.surgeryRiskClass === "standard";
const ageEligible: boolean = i.age >= 75;
const ageModifier: 0 | 1 = ageEligible && !isLowRiskSurgery ? 1 : 0;
const ageModifierSuppressed: boolean = ageEligible && isLowRiskSurgery;

if (ageModifier === 1) {
  if (grade === "green") grade = "orange";
  else if (grade === "orange") grade = "red";
}
```

Truth table:

| `age ≥ 75` | `surgeryRiskClass` | `ageEligible` | `ageModifier` | `ageModifierSuppressed` |
|---|---|---|---|---|
| no  | any                | false | 0 | false |
| yes | minor / standard   | true  | 0 | **true** |
| yes | large / critical   | true  | 1 | false |

`ageModifier === 1` and `ageModifierSuppressed === true` are **mutually exclusive** — asserted in tests.

### 2.4 Snapshot shape

```ts
interface PerioperativeRiskResult {
  domains: Record<DomainKey, DomainResult>;
  worstDomain: DomainKey;
  ageModifier: 0 | 1;
  ageEligible: boolean;            // NEW
  ageModifierSuppressed: boolean;  // NEW
  grade: RiskGrade;
  drivers: string[];
  partial: boolean;
  inputSource: "assessment" | "questionnaire" | "default";  // NEW
  calculatedAt: string;
}
```

**Backwards-compatibility** for pre-backfill snapshots already in `surgeries.perioperativeRisk` JSONB:

| Reader | Fallback when field missing |
|---|---|
| `RiskChip.preliminary` | `snapshot.inputSource ? snapshot.inputSource !== "assessment" : snapshot.partial === true` |
| `RiskBreakdownPopover` age-line | `ageModifierSuppressed ?? false` (legacy falls back to today's `ageModifier === 1` line) |
| `RiskBreakdownPopover` preliminary header | same as `RiskChip.preliminary` |

UI behaves sensibly even before backfill runs.

### 2.5 Recompute triggers

| Event | Hook (today) | Change |
|---|---|---|
| Surgery created / edited | `recomputeRiskForSurgery` | unchanged |
| Pre-op assessment saved / edited | `recomputeRiskForSurgery` | unchanged |
| **Questionnaire submitted / updated** | — | **NEW**: invoke `recomputeRiskForPatientFutureSurgeries(patientId)` after write. Covers all future non-cancelled surgeries the patient has. |
| Hospital `illnessLists` config changed | — | out of scope (snapshots stay until next normal recompute) |

`recomputeRiskForSurgery` itself doesn't need changes — it already passes the latest questionnaire to `deriveRiskInputsFromRecords`. Only the questionnaire's *consumption* inside derivation was missing.

### 2.6 Boundary cases

| Case | Behaviour |
|---|---|
| No questionnaire, no assessment | `inputSource: "default"`, `partial: true`, all concepts false. Grade computes from age/sex/surgery class only (today's behaviour). |
| Questionnaire only | `inputSource: "questionnaire"`, `partial: true`. Concepts derived from patient-reported data. Chip dashed + `~`, popover shows Preliminary header. |
| Assessment only (no questionnaire) | `inputSource: "assessment"`, `partial: false`. Identical to today. |
| Both | Per-key fall-through: assessment wins where it has a key, questionnaire fills gaps. `inputSource: "assessment"`. |
| Empty assessment row exists (created but never edited) | Treated as no-assessment for provenance: all organ-system maps empty → fall through to questionnaire. `inputSource: "questionnaire"` if questionnaire exists, else `"default"`. |
| `surgeryRiskClass` is `null` | Defaults to `"minor"` (existing behaviour) → age modifier suppressed. Consistent. |
| Multiple questionnaire responses | `getLatestQuestionnaireResponseForPatient` selects newest (today's behaviour). Unchanged. |
| Questionnaire item with missing `category` | Skipped by `projectQuestionnaireConditionsToOrganMaps`. Defensive. |

---

## Section 3 — UI surfacing

### 3.1 Preliminary state — visual treatment

When `inputSource !== "assessment"`, the chip changes in three small ways. No separate component.

| Element | Today (Assessed) | Preliminary |
|---|---|---|
| Border | solid (`border-green-500/30` etc.) | **dashed** (`border-dashed` modifier) |
| Dot | solid filled | solid filled — unchanged |
| Suffix label | `MED · VTE` | `MED · VTE · ~` |
| Tooltip / `aria-label` | `"Medium risk — VTE"` | `"Preliminary — based on patient questionnaire only"` |

**Why tilde + dashed (not the word "Preliminary" inline):** the chip is rendered in four width-constrained spots (calendar tiles, PACU card, sticky header, main header). Adding "Preliminary" pushes it past tile width. Dashed border + `~` is read-at-a-glance, fits everywhere, and the full label lives in the tooltip and popover.

**Compact (calendar tile) variant:** the existing `bg-black/35` wrapper gains a dashed border and a leading `~` (`~MEDIUM`). When `insufficient=true` (NOT DEFINED), the chip stays as-is — NOT DEFINED is already its own state, no preliminary marker.

**One new prop on `RiskChip`:** `preliminary?: boolean` (default false). Derived by the caller from `snapshot.inputSource !== "assessment"` (with the backwards-compat fallback in §2.4). Single source of truth in the snapshot, single prop in the chip — no per-call-site logic.

### 3.2 Popover (`RiskBreakdownPopover`)

Two single-line additions:

1. **Preliminary header**, only when `preliminary`:
   ```
   ⓘ Preliminary — based on patient questionnaire (no anesthesia pre-op assessment yet)
   ```
   Amber text (`text-amber-300`), above the DOMAINS section.

2. **Age-suppressed line** (replaces the existing "bumped up one band" line in the suppressed case):
   ```
   ⓘ Age ≥75 bump suppressed (minor surgery)
   ```
   Slate-400. Mutually exclusive with the amber bumped-up line — only one ever renders.

DOMAINS, DRIVERS, OUTPATIENT, and the `How is this calculated? →` link remain unchanged.

### 3.3 Call-site updates

Only the parents that already pass `risk` to `RiskChip` start passing `preliminary`. The derivation helper is centralized:

```ts
// shared/scoring/perioperativeRisk.ts
export function isPreliminary(snapshot: PerioperativeRiskResult | null | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.inputSource) return snapshot.inputSource !== "assessment";
  return snapshot.partial === true; // backwards-compat for pre-backfill snapshots
}
```

Sites:

| Site | File | Change |
|---|---|---|
| Patient sticky header | `client/src/pages/PatientDetail.tsx` | `preliminary={isPreliminary(risk)}` |
| Patient main header | `client/src/pages/PatientDetail.tsx` | same |
| PACU patient card | wherever the PACU chip is rendered (grep `<RiskChip`) | same |
| OPCalendar tile (Day view) | calendar Day-view component | same |
| OPCalendar tile (Month view) | calendar Month-view component | same |
| Week-view hover popover | `TimelineWeekView.tsx` | passes the full snapshot through; `RiskBreakdownPopover` handles preliminary internally via `isPreliminary(risk)` |
| Heat-map tile tint | OPCalendar | **unchanged** — tint conveys grade band; dashed chip in the corner is enough |

### 3.4 `/risk-methodology` rewrite

New structure, top-down:

```
1. Title + intro                        (unchanged)
2. NEW: "How the final grade is calculated"
   - Pipeline:
       Patient + surgery
        → domain bands (5 scores)
        → worst-domain
        → age modifier (≥75 bumps up — EXCEPT for minor/standard surgery)
        → final grade (LOW / MED / HIGH)
   - Tiebreaker priority: cardiac > vte > pulmonary > frailty > surgery
   - Attenuation rule + why ("a minor procedure does not amplify
     age-driven baseline risk")
   - Preliminary scoring paragraph:
       "Risk is calculated as soon as the patient submits the
        questionnaire and is refined once the anesthesia pre-op
        assessment is completed. The anesthetist's entry overrides
        patient-reported data on a per-condition basis."
   - 4 worked examples (compact: facts → bands → modifier → grade)
3. Existing 5 domain sections           (unchanged)
4. Footer                                (unchanged)
```

Worked examples:

| # | Patient | Surgery | Domain bands | Modifier | Grade |
|---|---|---|---|---|---|
| A | 82F, smoker, no comorbidities | Hernia (minor) | Cardiac LOW · VTE MED · Pulm MED · Frailty LOW · Surgery LOW | suppressed (minor) | **ORANGE · VTE** |
| B | Same 82F | Hip replacement (large) | same bands | applies → bump | **RED · VTE** |
| C | 70M, CAD + CHF + CKD, MET <4 | Cataract (minor) | Cardiac HIGH · VTE LOW · Pulm LOW · Frailty MED · Surgery LOW | N/A (age < 75) | **RED · CARDIAC** — attenuation doesn't mask sick patients |
| D | Same 82F as A | Hernia (minor), **questionnaire only, no pre-op assessment yet** | computed from questionnaire | suppressed | **ORANGE · VTE · ~ (Preliminary)** |

The methodology page renders the new section as structured JSX (not one giant `t()` blob) so each example can be styled independently as a small panel with the band breakdown.

### 3.5 What does NOT change

- `RiskChip` API outside the new `preliminary` prop.
- `RiskBreakdownPopover` layout outside the two new optional lines.
- Heat-map tint logic on calendar tiles.
- NOT DEFINED rendering (no preliminary marker — different state).
- Any week-view code beyond passing the full snapshot through.

---

## Section 4 — Tests, backfill, i18n rollout

### 4.1 Algorithm tests — `shared/scoring/__tests__/perioperativeRisk.test.ts`

New `describe("age modifier × surgery class attenuation")` block — table-driven:

| Test case | Age | Surgery class | Worst | `ageModifier` | `ageModifierSuppressed` | Grade |
|---|---|---|---|---|---|---|
| Bump applies on large | 82 | `large` | MED | 1 | false | RED |
| Bump applies on critical | 82 | `critical` | MED | 1 | false | RED |
| Bump suppressed on minor | 82 | `minor` | MED | 0 | true | ORANGE |
| Bump suppressed on standard | 82 | `standard` | MED | 0 | true | ORANGE |
| Below threshold — no suppression flag | 70 | `minor` | MED | 0 | false | ORANGE |
| Below threshold — no bump | 70 | `large` | HIGH | 0 | false | RED |
| Sick patient not masked | 70 | `minor` | HIGH | 0 | false | RED |
| Eva regression case | 82 | `minor` | MED (VTE + Pulm) | 0 | true | ORANGE · VTE |
| `surgeryRiskClass = null` defaults to minor | 82 | null → minor | MED | 0 | true | ORANGE |

Second block `describe("snapshot fields")`:

- `ageEligible: true` whenever age ≥ 75, regardless of suppression.
- `ageModifierSuppressed === true` and `ageModifier === 1` are never both true.

### 4.2 Input derivation tests — `server/scoring/__tests__/computePerioperativeRisk.test.ts`

**`projectQuestionnaireConditionsToOrganMaps` (unit):**
- Maps `cardiovascular` items into the cardio bucket, `pulmonary` into lung, `coagulation` into coag, etc.
- Items with missing or unrecognized `category` are skipped.
- `checked: false` entries land as `false`, not absent (so they can override questionnaire-inferred truths if needed).

**`deriveRiskInputsFromRecords` per-key fall-through:**
- Questionnaire only → concepts derived from questionnaire, `inputSource: "questionnaire"`, `partial: true`.
- Assessment with CAD ticked, lung map empty → CAD true (assessment), COPD falls through to questionnaire.
- Both empty → all concepts false, `inputSource: "default"`, `partial: true`.
- BMI: assessment weight/height wins; missing → questionnaire fallback; both missing → null.
- Empty assessment row (all organ-system maps empty) → `inputSource: "questionnaire"` if questionnaire exists.

**Eva regression (no DB):**
- Fake patient (82, smoker, no other flags), fake questionnaire with no comorbidity checks, no assessment.
- `computeRiskSnapshot` → `grade: "orange"`, `worstDomain: "vte"`, `ageModifierSuppressed: true`, `inputSource: "questionnaire"`, `partial: true`.

### 4.3 Recompute trigger test — `server/scoring/__tests__/recomputeTriggers.test.ts` (new)

- Stub the questionnaire submit route handler with a fake storage layer.
- Assert `recomputeRiskForPatientFutureSurgeries(patientId)` is called once after a successful POST and once after a successful PUT.
- Regression: the existing assessment-edit trigger still fires.

No DB-touching integration test — matches the existing project memory note that supertest auth-mock isn't in this codebase.

### 4.4 UI tests

**`client/src/components/anesthesia/__tests__/RiskChip.test.tsx`** — extend:
- `preliminary={true}` renders `border-dashed` and appends ` · ~` to the label.
- `preliminary={true}` sets `aria-label` to the i18n `chip.preliminaryTooltip` value.
- `preliminary={true} compact={true}` renders `~MEDIUM` with a dashed wrapper.
- `insufficient={true}` with `preliminary={true}` → NOT DEFINED wins (no tilde, no dash).

**`client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx`** — extend:
- Shows `popover.preliminaryNote` only when `risk.inputSource !== "assessment"` (via `isPreliminary`).
- Shows `popover.ageSuppressedNote` only when `risk.ageModifierSuppressed`.
- The amber "bumped up one band" line and the slate suppressed line never render together.
- Backwards-compat: a snapshot missing `inputSource` but with `partial: true` still renders the preliminary header.

**`client/src/pages/__tests__/RiskMethodology.test.tsx`** — extend:
- Renders the new `howCalculated.title` section heading.
- Renders all four worked example titles.
- The five existing domain sections still render (regression).

### 4.5 Backfill

`scripts/backfill-risk-grade.ts` already iterates all non-cancelled surgeries within `BACKFILL_DAYS_AGO` and calls `recomputeRiskForSurgery`. **No script changes needed** — `computeRiskSnapshot` returning the new fields auto-flows into JSONB via the existing write path.

Deploy note (add to `replit.md` or the equivalent deploy doc):

```
After deploy:
  BACKFILL_DAYS_AGO=365 node scripts/run-with-pm2-env.cjs scripts/backfill-risk-grade.ts
```

Idempotent — running it twice produces identical snapshots. Safe to re-run.

### 4.6 i18n rollout

New keys in `client/src/locales/en/translation.json` and `de/translation.json`:

```
riskMethodology.howCalculated.title
riskMethodology.howCalculated.pipeline
riskMethodology.howCalculated.tiebreaker
riskMethodology.howCalculated.attenuation
riskMethodology.howCalculated.preliminary
riskMethodology.howCalculated.examples.{a,b,c,d}.{title, facts, bands, modifier, result}
chip.preliminaryTooltip
popover.preliminaryNote
popover.ageSuppressedNote
```

DE strings use formal clinical tone (no second-person "Du", no casual phrasing). EN + DE drafted in the implementation plan.

IT / ES / FR / ZH — explicitly out of scope; covered by the existing translation-pass follow-up from the original risk-grade work.

### 4.7 Manual smoke checklist (deploy day)

1. Open Eva Steiner's surgery in OP calendar — chip is **MED · VTE** (orange, solid border, popover shows "Age ≥75 bump suppressed").
2. Open any age-<75 surgery — popover has neither the suppressed line nor the bumped-up line.
3. Open a fresh patient with only a submitted questionnaire (no anesthesia pre-op) — chip is dashed with ` · ~`; popover top line shows Preliminary.
4. Anesthetist opens that patient's pre-op assessment, ticks one illness, saves. Chip becomes solid (no `~`, no dashed). Snapshot `inputSource` flips to `"assessment"`.
5. `/risk-methodology` — new top section renders; all 4 examples visible; 5 domain sections still present below.
6. Run backfill with `--dry-run` first (if supported) or against a single hospital ID; verify count of surgeries updated; then live run for `BACKFILL_DAYS_AGO=365`.

---

## Files touched (estimate)

**Server:**
- `shared/scoring/perioperativeRisk.ts` — algorithm + snapshot shape + `isPreliminary` helper.
- `server/scoring/computePerioperativeRisk.ts` — `deriveRiskInputsFromRecords` rewrite.
- `server/scoring/projectQuestionnaireConditionsToOrganMaps.ts` — new helper.
- `server/routes/<questionnaire>` — wire `recomputeRiskForPatientFutureSurgeries` into submit + update handlers.

**Client:**
- `client/src/components/anesthesia/RiskChip.tsx` — `preliminary` prop, dashed border + tilde rendering.
- `client/src/components/anesthesia/RiskBreakdownPopover.tsx` — preliminary header + suppressed-bump line.
- `client/src/pages/RiskMethodology.tsx` — new top section + 4 worked examples.
- Call sites passing `preliminary`: `PatientDetail.tsx`, PACU card, OPCalendar Day + Month tiles, week-view (passes through).

**Translations:**
- `client/src/locales/en/translation.json`
- `client/src/locales/de/translation.json`

**Tests:**
- `shared/scoring/__tests__/perioperativeRisk.test.ts` (extend)
- `server/scoring/__tests__/computePerioperativeRisk.test.ts` (new or extend)
- `server/scoring/__tests__/recomputeTriggers.test.ts` (new)
- `client/src/components/anesthesia/__tests__/RiskChip.test.tsx` (extend)
- `client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx` (extend)
- `client/src/pages/__tests__/RiskMethodology.test.tsx` (extend)

**No DB migration.** All new fields live in the existing `surgeries.perioperativeRisk` JSONB column. Backfill repopulates.

---

## Open questions

None at design time. Outstanding decisions are all about copy (precise EN + DE wording for the new keys) and will be made when writing the implementation plan.
