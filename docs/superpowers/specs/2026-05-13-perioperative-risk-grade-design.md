# Perioperative Risk Grade — Design

**Date:** 2026-05-13
**Status:** Approved, ready for implementation plan
**Scope:** Single iteration — composite scoring engine, OP calendar heat-map, patient-header chip, methodology page. Existing ambulant gate kept intact.

## Problem

Viali ships an ambulant eligibility gate (calculator + traffic light) that answers a narrow question: *can this patient be safely discharged the same day?* It surfaces on OP calendar tiles as a 🟢/🟡/🔴 emoji pill.

Two issues:

1. **Overnight cases are invisible.** When `stayType = overnight` the ambulant pipeline short-circuits to green — the team gets no signal for an objectively high-risk overnight case. The 3rd dot on the OP plan is not a risk score; it's an ambulant verdict.
2. **The 3rd dot is confusing.** OP calendar tiles already show (1) a questionnaire-status corner dot and (2) a pre-op assessment status pill. Adding the ambulant 🟢🟡🔴 pill produces three indicators per card that read as the same thing at a glance.

What's missing: a **general perioperative risk grade** that the whole team can use to see "who needs careful attention" — independent of stay type, calculable from what Viali already stores.

## Goal

Add a general perioperative risk grade (`green | orange | red`) that:

- Reflects the patient's global perioperative risk across cardiac, VTE, pulmonary, frailty, and surgery-weight dimensions.
- Is computed automatically from existing patient + surgery data, with one new questionnaire field for the frailty score.
- Surfaces on the OP calendar via a toggleable heat-map mode (so the planning view can switch between "neutral" and "show me the risk").
- Is always visible in the anesthesia patient detail, PACU, and surgery documentation dialogs — independent of the heat-map toggle.
- Replaces the existing 3rd dot on OP calendar tiles. The ambulant verdict re-surfaces as a sub-line inside the new risk display when `stayType = ambulant`.

Out of scope: editable thresholds, NSQIP API integration, full ARISCAT (this iteration uses a custom Viali pulmonary sub-score — see Scoring Engine), SpO2/Hb/respiratory-infection capture, mortality estimates.

## Architecture

**Two pipelines, side-by-side, both reading the same patient + surgery facts.**

```
patient.illnessItems  ─┐
patient.questionnaire ─┼──▶ calculatePerioperativeRisk() ──▶ surgeries.riskGrade
surgery.surgeryRiskClass ─┤                                  surgeries.perioperativeRisk (JSONB)
patient.age, sex, BMI ────┘
                       │
                       └──▶ calculateAmbulantQuickCheck() ──▶ surgeries.ambulantQuickCheck (unchanged)
```

The general risk grade and the ambulant gate answer different questions:

- **General risk grade:** how careful do we need to be?
- **Ambulant gate:** what's the venue (same-day vs overnight)?

They share inputs but never collapse into a single number — mixing them muddies both.

**Scoring code lives in `shared/scoring/perioperativeRisk.ts`**, alongside the existing `ambulantEligibility.ts`. Pure, synchronous, sub-millisecond. Imported by client (live re-render) and server (write-time persistence).

**Triggers (server):** the risk grade recomputes when (a) a surgery is created or its `surgeryRiskClass` / `stayType` changes, (b) a patient's `illnessItems` are added/removed/changed, (c) a `patientQuestionnaireResponses` row is submitted or edited.

## Scoring Engine

### Domains

```ts
calculatePerioperativeRisk(input) → {
  domains: {
    cardiac:   { band: 'low'|'med'|'high', score, source: 'RCRI' },
    vte:       { band: 'low'|'med'|'high', score, source: 'Caprini' },
    pulmonary: { band: 'low'|'med'|'high', source: 'Viali pulmonary v1' },
    frailty:   { band: 'low'|'med'|'high', score, source: 'mFI-5', partial: boolean },
    surgery:   { band: 'low'|'med'|'high', source: 'surgeryRiskClass' },
  },
  worstDomain: keyof domains,
  ageModifier: 0 | 1,
  grade: 'green' | 'orange' | 'red',
  drivers: string[],       // top 3, ordered by severity
  partial: boolean,        // any domain missing inputs
  calculatedAt: ISO8601,
}
```

### Domain → band thresholds

These re-use the categories that the existing `shared/scoring/*.ts` calculators already produce, mapped to a unified 3-band scale.

| Domain | Subscale | low | med | high |
|---|---|---|---|---|
| Cardiac | RCRI (`shared/scoring/rcri.ts` category) | `low` (0 pts) | `moderate` (1 pt) | `high` (≥2 pts) |
| VTE | Caprini (`shared/scoring/caprini.ts` category) | `low` / `moderate` (0–2 pts) | `higher` (3–4 pts) | `high` / `veryHigh` (≥5 pts) |
| Pulmonary | Custom sub-score (see below) | — | — | — |
| Frailty | mFI-5 count (0–5) | 0 | 1–2 | ≥3 |
| Surgery | `surgeryRiskClass` | minor | standard / large | critical |

**Cardiac and VTE bands inherit directly from the existing implementations** so the two pipelines stay consistent: a patient who is `high` on RCRI is also `high` on the cardiac axis of the general risk grade. No duplicate threshold tables; one source of truth.

**RCRI, Caprini, and mFI-5 are each independently validated in published literature.** The combination — worst-domain-wins — is custom but explicit.

### Band → grade aggregation

- All domains `low` → **green**
- Any domain `med` AND none `high` → **orange**
- Any domain `high` → **red**

### Age modifier

If `patient.age ≥ 75`:
- `green` → `orange`
- `orange` → `red`
- `red` → `red` (capped)

Age never bumps down. Applied after worst-domain aggregation.

### Drivers and chip text

`worstDomain` (a domain key — `'cardiac' | 'vte' | 'pulmonary' | 'frailty' | 'surgery'`) is the single source of truth for the inline patient-header chip text: `${grade.toUpperCase()} · ${worstDomain.toUpperCase()}` → "MED · CARDIAC".

`drivers[]` is a separate, parallel array of short human-readable strings (`"Cardiac (RCRI 2 pts, high)"`, `"mFI-5 = 3"`, `"Critical surgery class"`) sorted by band severity (high before med before low), max length 3. Drivers are rendered in the popover and on the methodology page — never in the inline chip.

**Tiebreaker for `worstDomain`** (when multiple domains share the highest band): fixed priority `cardiac > vte > pulmonary > frailty > surgery`. Cardiac wins ties because it is the highest-mortality domain in published peri-op outcomes.

### Pulmonary sub-score (this iteration)

Honest framing: this is a **custom Viali pulmonary indicator**, not ARISCAT. Full ARISCAT requires SpO2, recent respiratory infection, preop Hb, surgical incision site, and duration — Viali doesn't capture most of these today. Calling our subset "ARISCAT-lite" would misrepresent it.

The Viali pulmonary sub-score uses only inputs that already exist (or are added by this iteration's smoking-field migration):

| Condition | Band |
|---|---|
| COPD concept present | **high** |
| Current smoker AND age ≥ 70 | **med** |
| Current smoker AND `plannedDurationMinutes` > 180 | **med** |
| Current smoker (other) | **low** (still increases composite via age modifier when applicable) |
| Neither COPD nor smoker | **low** |

The JSONB `source` field is `"Viali pulmonary v1"` — explicit, versioned, not pretending to be a published score. The `/risk-methodology` page lists the inputs and rules verbatim, including the disclaimer "approximation of postoperative pulmonary risk; not validated against ARISCAT." A future iteration can replace this with full ARISCAT once SpO2/Hb/respiratory-infection capture is added.

### mFI-5 partial mode

Until the new `functionallyDependent` questionnaire field is answered, mFI-5 is computed on the 4 available factors (COPD, CHF, hypertension requiring meds, insulin-DM). The result is flagged `partial: true` and the UI shows "(partial — questionnaire pending)" on the chip popover.

## Data Model

All migrations idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

### `surgeries`

```
ADD COLUMN risk_grade text                  -- 'green' | 'orange' | 'red'
ADD COLUMN perioperative_risk jsonb         -- full snapshot (see shape below)

CREATE INDEX idx_surgeries_risk_grade ON surgeries(hospital_id, risk_grade)
```

### `patient_questionnaire_responses`

```
ADD COLUMN functionally_dependent boolean   -- mFI-5 input #5
```

### Smoking field — audit before migration

Before writing the migration, audit `patient_questionnaire_responses` and `patients` for any existing smoking field. If a `currentSmoker` / `smoker` / equivalent column exists, reuse it. If none exists, add:

```
ALTER TABLE patient_questionnaire_responses ADD COLUMN current_smoker boolean
```

Smoking status is asked at pre-op (same place as the new functional-dependence question), not on patient master data.

### JSONB shape

```jsonc
{
  "domains": {
    "cardiac":   { "band": "med", "score": 2, "mace": "1-6%", "source": "RCRI" },
    "vte":       { "band": "low", "score": 3, "source": "Caprini" },
    "pulmonary": { "band": "low", "source": "Viali pulmonary v1" },
    "frailty":   { "band": "med", "score": 2, "source": "mFI-5", "partial": false },
    "surgery":   { "band": "med", "source": "surgeryRiskClass:large" }
  },
  "worstDomain": "cardiac",
  "ageModifier": 0,
  "grade": "orange",
  "drivers": ["Cardiac (RCRI 2, 1-6% MACE)", "Large surgery class", "mFI-5 = 2"],
  "calculatedAt": "2026-05-13T08:30:00.000Z",
  "partial": false
}
```

### No editable thresholds

Bands are hard-coded constants in `shared/scoring/perioperativeRisk.ts`. A future iteration can move them to a `hospitals.scoringConfig` JSONB for per-clinic customization (same pattern as the existing illness-list customization), but that is explicitly out of scope here.

## UI Surfaces

### 1. OP Calendar — `client/src/components/anesthesia/OPCalendar.tsx`

**Remove:** the existing `ambulantQuickCheck` pill block on each surgery tile (currently lines ~1371–1394). This is the only deletion from the existing ambulant code path.

**Add:** a `<HeatmapToggle />` in the calendar header, inline next to the Day / Week / Month view switcher. Persisted in `localStorage` per-user (`opCalendar.heatmapEnabled`).

**Heat-map ON treatment per surgery card:**
- background tint at ~25% opacity in the grade color (green/orange/red),
- 4-pixel left accent strip in the solid grade color,
- a `LOW` / `MED` / `HIGH` risk chip absolutely positioned top-right.

**Same treatment for the table/list day-week view:** rows get the tint + left accent + chip in a leading cell.

**Month view bonus:** each date cell renders 3 micro-dots — count of `green` / `orange` / `red` surgeries that day. Data is already on the enriched events; trivial addition.

**Heat-map OFF:** cards render as today minus the removed ambulant pill. Pre-op status badge and questionnaire dot stay exactly as they are.

### 2. `<PerioperativeRiskHeader />` — shared component

Single component replacing the bespoke patient-header HTML in three places: anesthesia patient detail, PACU dialog, surgery documentation dialog. Always-visible, independent of the heat-map toggle.

Layout:
- Patient name + risk chip inline. Chip text: `MED · CARDIAC`, `HIGH · FRAILTY`, etc. — capitalized from `drivers[0]` domain key.
- Existing meta line unchanged (DOB / sex / surgery / surgeon).
- **Conditional sub-line below meta — only when `surgery.stayType === 'ambulant'`:**
  - `OUTPATIENT  ● Eligible — no hard exclusions`
  - or `OUTPATIENT  ● Not eligible — BMI 41, frailty high`
  - Bullet color follows the ambulant decision (green/yellow/red) — separate from the general risk grade.

### 3. Risk chip click behavior

Clicking the risk chip opens `<RiskBreakdownPopover />`:
- All 5 domain bands stacked, each with its subscale number,
- The worst-domain driver and the age modifier (if applied),
- The full `drivers[]` list,
- The ambulant verdict and reason codes (when applicable),
- Footer link: **"How is this calculated?" → `/risk-methodology`** (opens in a new tab).

### 4. `/risk-methodology` Page (new)

Public to any logged-in Viali user. No admin role required.

Layout:
- Intro: what the grade means, when it's calculated, what triggers a recalculation.
- One section per domain (cardiac / VTE / pulmonary / frailty / surgery): subscale name + published source + input list + threshold table.
- Aggregation rule: worst-domain-wins + age modifier.
- Versioning footer: `Methodology v1 · effective 2026-05-13`. Threshold or formula changes bump the version.

Also linked from `/admin → Settings → Clinical Scoring` for the admin breadcrumb.

### 5. Scope of the heat-map toggle

The toggle controls only surgery-card / row tinting on the OP planning views. Patient headers always show the chip regardless of toggle state.

## Migration of the Existing Ambulant Pill

**Unchanged:**
- `shared/scoring/ambulantEligibility.ts` (`calculateQuick`, `calculateFull`).
- `server/scoring/computeAmbulantQuickCheck.ts`.
- `server/routes/anesthesia/preop.ts` `applyAmbulantFullAssessment`.
- `surgeries.ambulantQuickCheck` JSONB + audit fields (`ambulantOverrideBy`, `ambulantOverrideReason`, `ambulantOverrideAt`).
- The full ambulant assessment panel + override modal on the anesthesia patient detail right rail.

**Removed:**
- `OPCalendar.tsx` ambulant pill block (the 🟢🟡🔴 emoji block on the card).

**Added (covered above):**
- Ambulant verdict resurfaces as the conditional sub-line in `<PerioperativeRiskHeader />` when `stayType === 'ambulant'`. Reads `surgery.ambulantQuickCheck.decision` + `hardExclusions` + `yellowFactors` from the same payload — no new data source.

**Net effect:**
- Anesthesia pre-op workflow: identical.
- API contracts: zero break. `/api/anesthesia/surgeries` already returns `ambulantQuickCheck`; we just stop rendering one place.
- OP calendar: third dot disappears; ambulant info is visible via the risk chip popover and the patient header sub-line.

### Backfill

On deploy, a one-time `scripts/backfill-risk-grade.ts` runs `calculatePerioperativeRisk()` for every non-cancelled future-dated surgery and writes `riskGrade` + `perioperativeRisk`. Idempotent — running again is a no-op. Past surgeries can be backfilled in batches or left null (UI shows "not calculated" gracefully).

## Testing

### Unit — `shared/scoring/perioperativeRisk.test.ts`
- Each domain → band mapping (table-driven, one row per published threshold boundary).
- Worst-domain-wins aggregation: synthetic inputs covering low/low/low (green), any-med-no-high (orange), any-high (red).
- Age modifier: 74 vs 75 boundary, capping at red.
- Partial flag: mFI-5 with `functionallyDependent === null` returns `partial: true` and a band from 4 factors.
- Drivers array: ordered by severity, max length 3.

### Server — recalculation triggers
- `tests/scoring/perioperativeRisk.recalc.test.ts`: assert `riskGrade` updates on surgery create, on `illnessItems` change, on questionnaire submit/edit, on `surgeryRiskClass` change.
- Reads persisted JSONB; asserts both `riskGrade` and `drivers` look right.

### Migration
- `tests/migrations/risk-grade-idempotent.test.ts`: run the new migration twice against a clean schema; expect no error and identical result.

### UI / regression
- `tests/opcalendar/heatmap.test.tsx`: toggle off → no tint/no chip. Toggle on → tint class applied, chip rendered. `localStorage` persistence verified.
- `tests/opcalendar/ambulant-pill-removed.test.tsx`: regression guard — the 🟢🟡🔴 pill is no longer in the DOM on any surgery card.
- `tests/components/PerioperativeRiskHeader.test.tsx`: chip with `MED · CARDIAC` style; ambulant sub-line only when `stayType === 'ambulant'`; popover click opens `<RiskBreakdownPopover />`.

### Methodology page
- `tests/pages/risk-methodology.test.tsx`: all 5 domain sections render; footer version string present; "How is this calculated?" link from a chip lands here.

### Backfill
- `scripts/backfill-risk-grade.ts` is idempotent — running twice produces no diff. Test against fixture DB, assert row counts + grades unchanged on second run.

### Public docs
- No new public webhook endpoints in this iteration. CLAUDE.md `PUBLIC_API_MD` rule does not apply. If a future iteration exposes `riskGrade` on a public endpoint, `PUBLIC_API_MD` is updated in the same commit.

## Open Questions

None blocking implementation. Methodology versioning (when thresholds change in future) is intentionally minimal in v1 — a hard-coded `v1` string in the footer. Per-clinic threshold customization is a Phase 2 concern.

## Roadmap (out of scope for this spec)

1. **Editable thresholds** per hospital, in a `hospitals.scoringConfig` JSONB (same pattern as illness-list customization).
2. **Full ARISCAT** — add SpO2, recent respiratory infection, anemia capture; replace `Viali pulmonary v1` with validated ARISCAT.
3. **Frailty deepening** — Clinical Frailty Scale (CFS) as an alternative to mFI-5 for older cohorts.
4. **Filter by risk** on the OP calendar — list view filter pill that uses `idx_surgeries_risk_grade`.
5. **Risk-grade aware dashboard widgets** — "% of next week's surgeries in red" trend card.
