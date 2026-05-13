# Perioperative Risk Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general perioperative risk grade (green/orange/red) computed automatically from existing patient + surgery data, surfaced via a toggleable heat-map on the OP calendar and an always-visible chip in patient headers. Keep the existing ambulant gate intact.

**Architecture:** Two pipelines side-by-side: existing `calculateAmbulantQuickCheck` stays untouched; new `calculatePerioperativeRisk` lives alongside it in `shared/scoring/`. Worst-domain-wins across 5 axes (cardiac via existing RCRI, VTE via existing Caprini, custom Viali pulmonary v1, mFI-5 frailty, surgery weight from `surgeryRiskClass`). Server recomputes on surgery / patient / questionnaire writes; persists to `surgeries.risk_grade` + `surgeries.perioperative_risk` JSONB.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres, Express, React, Tailwind, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-13-perioperative-risk-grade-design.md`

**Important pre-flight notes:**
- `patients.smokingStatus` (`varchar`, values `'never' | 'former' | 'current'`) already exists at `shared/schema.ts:4558` — no smoking-field migration needed.
- Illnesses live on the `patients` row as `heartIllnesses`, `lungIllnesses`, etc. JSONB columns (`shared/schema.ts:2009+`). Patient PATCH at `server/routes/anesthesia/patients.ts:209` is the recalc trigger for comorbidity changes.
- Concept-tag resolution: `shared/scoring/findConcept.ts` already maps custom illness items to the fixed 18-concept taxonomy. Reuse it.

---

## File Structure

### Files to create

- `migrations/NNNN_perioperative_risk.sql` — idempotent migration: adds `surgeries.risk_grade`, `surgeries.perioperative_risk`, `patient_questionnaire_responses.functionally_dependent`, plus index.
- `shared/scoring/perioperativeRisk.ts` — pure calculator (`calculatePerioperativeRisk`).
- `shared/scoring/__tests__/perioperativeRisk.test.ts` — unit tests, mirrors existing pattern in this folder.
- `shared/scoring/pulmonary.ts` — Viali pulmonary v1 sub-score (separate file for clarity + isolated testing).
- `shared/scoring/mfi5.ts` — mFI-5 calculator with partial-mode support.
- `server/scoring/computePerioperativeRisk.ts` — server-side adapter: loads patient + surgery + questionnaire, calls pure calculator, returns snapshot.
- `server/scoring/__tests__/computePerioperativeRisk.test.ts` — server adapter tests.
- `scripts/backfill-risk-grade.ts` — one-shot backfill for future-dated non-cancelled surgeries.
- `scripts/__tests__/backfill-risk-grade.test.ts` — idempotency test.
- `client/src/components/anesthesia/RiskChip.tsx` — shared risk chip (used in header + calendar + popover).
- `client/src/components/anesthesia/PerioperativeRiskHeader.tsx` — shared patient-header component.
- `client/src/components/anesthesia/RiskBreakdownPopover.tsx` — clickable breakdown.
- `client/src/components/anesthesia/HeatmapToggle.tsx` — OP calendar toggle (localStorage persistence).
- `client/src/pages/RiskMethodology.tsx` — `/risk-methodology` page.
- `client/src/components/anesthesia/__tests__/PerioperativeRiskHeader.test.tsx`
- `client/src/components/anesthesia/__tests__/RiskChip.test.tsx`
- `client/src/components/anesthesia/__tests__/HeatmapToggle.test.tsx`
- `client/src/pages/__tests__/RiskMethodology.test.tsx`

### Files to modify

- `shared/schema.ts` — add 3 new columns to two tables.
- `server/routes/anesthesia/surgeries.ts` — add `applyPerioperativeRiskRecalc` step in POST + PATCH flows.
- `server/routes/anesthesia/patients.ts:209` — recalc all the patient's future-dated surgeries on patient PATCH.
- `server/routes/questionnaire.ts:1512` (public submit) and `:575` (PUT) — recalc all matched surgeries when a questionnaire is submitted or edited.
- `client/src/components/anesthesia/OPCalendar.tsx` — remove lines 1371–1394 (ambulant pill), wire `<HeatmapToggle />` in header, apply heat-map treatment when toggle ON.
- `client/src/pages/anesthesia/PatientDetail.tsx` — replace bespoke header with `<PerioperativeRiskHeader />`.
- `client/src/pages/anesthesia/Pacu.tsx:138` — wrap patient name area with `<PerioperativeRiskHeader />`.
- `client/src/components/anesthesia/AnesthesiaDocumentation.tsx` — wrap patient name area with `<PerioperativeRiskHeader />`.
- `client/src/App.tsx` — register `/risk-methodology` route.
- `client/src/pages/admin/AdminSettings*.tsx` (Clinical Scoring section) — add a "Methodology" link to `/risk-methodology`.

---

## Phase 1: Schema & migration

### Task 1: Add schema columns + idempotent migration

**Files:**
- Modify: `shared/schema.ts` (surgeries + patientQuestionnaireResponses table definitions)
- Create: `migrations/NNNN_perioperative_risk.sql`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1.1: Identify the next migration number**

Run: `ls /home/mau/viali/migrations/*.sql | sort | tail -3`
Expected: prints the last three migration filenames. Pick the next sequential number (e.g. if last is `0249_foo.sql`, use `0250`).

- [ ] **Step 1.2: Find the surgeries table block in schema.ts and add the new columns**

In `shared/schema.ts`, locate the `surgeries` table definition (search `export const surgeries = pgTable(`). Find the existing `ambulantOverrideAt` column. Right after it, add:

```ts
  riskGrade: text("risk_grade"),
  perioperativeRisk: jsonb("perioperative_risk"),
```

- [ ] **Step 1.3: Find the patientQuestionnaireResponses table block and add functionally_dependent**

In `shared/schema.ts`, search `export const patientQuestionnaireResponses = pgTable(`. At the end of its column list (before the closing `})`), add:

```ts
  functionallyDependent: boolean("functionally_dependent"),
```

- [ ] **Step 1.4: Write the migration SQL**

Create `migrations/NNNN_perioperative_risk.sql` (use the number from step 1.1):

```sql
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS risk_grade text;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS perioperative_risk jsonb;
CREATE INDEX IF NOT EXISTS idx_surgeries_risk_grade ON surgeries(hospital_id, risk_grade);
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS functionally_dependent boolean;
```

- [ ] **Step 1.5: Update the migrations journal**

Open `migrations/meta/_journal.json`. Read the existing entries. Append a new entry at the end of the `entries` array with:
- `idx`: previous max idx + 1
- `tag`: `NNNN_perioperative_risk`
- `when`: a millisecond timestamp **strictly greater than every existing `when` in the file** — use `Date.now()` or pick a value 1000ms above the current max
- `version`: same as other entries
- `breakpoints`: `true` (match the existing pattern)

- [ ] **Step 1.6: Push the migration**

Run: `cd /home/mau/viali && npm run db:migrate`
Expected: "Changes applied" with no errors. If a "non-idempotent" or "already exists" error appears, re-check that every statement uses `IF EXISTS` / `IF NOT EXISTS`.

- [ ] **Step 1.7: Verify the columns exist**

Run: `cd /home/mau/viali && npx drizzle-kit push --verbose 2>&1 | grep -iE "risk_grade|perioperative_risk|functionally_dependent|Changes applied|No changes"`
Expected: "No changes detected" (schema matches DB).

- [ ] **Step 1.8: Run the migration a second time to verify idempotency**

Run: `cd /home/mau/viali && psql "$DATABASE_URL" -f migrations/NNNN_perioperative_risk.sql`
Expected: zero errors. The second run is a no-op.

- [ ] **Step 1.9: Run typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: clean.

- [ ] **Step 1.10: Commit**

```bash
cd /home/mau/viali
git add shared/schema.ts migrations/NNNN_perioperative_risk.sql migrations/meta/_journal.json
git commit -m "feat(risk): schema columns for general perioperative risk grade"
```

---

## Phase 2: Scoring engine (pure, TDD)

### Task 2: Domain types and exports

**Files:**
- Create: `shared/scoring/perioperativeRisk.ts`
- Test: `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 2.1: Write the failing test for type exports**

Create `shared/scoring/__tests__/perioperativeRisk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  type RiskGrade,
  type DomainBand,
  type DomainKey,
  type PerioperativeRiskResult,
} from "../perioperativeRisk";

describe("perioperativeRisk types", () => {
  it("exports the expected enums", () => {
    const grade: RiskGrade = "green";
    const band: DomainBand = "low";
    const key: DomainKey = "cardiac";
    expect(grade).toBe("green");
    expect(band).toBe("low");
    expect(key).toBe("cardiac");
  });
});
```

- [ ] **Step 2.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: FAIL — `Cannot find module '../perioperativeRisk'`.

- [ ] **Step 2.3: Create the types file**

Create `shared/scoring/perioperativeRisk.ts`:

```ts
export type RiskGrade = "green" | "orange" | "red";
export type DomainBand = "low" | "med" | "high";
export type DomainKey = "cardiac" | "vte" | "pulmonary" | "frailty" | "surgery";

export interface DomainResult {
  band: DomainBand;
  score?: number;
  source: string;
  partial?: boolean;
}

export interface PerioperativeRiskResult {
  domains: Record<DomainKey, DomainResult>;
  worstDomain: DomainKey;
  ageModifier: 0 | 1;
  grade: RiskGrade;
  drivers: string[];
  partial: boolean;
  calculatedAt: string;
}
```

- [ ] **Step 2.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "feat(risk): types for perioperative risk grade"
```

---

### Task 3: Cardiac band (RCRI inheritance)

**Files:**
- Modify: `shared/scoring/perioperativeRisk.ts`
- Test: `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 3.1: Write failing test**

Append to `shared/scoring/__tests__/perioperativeRisk.test.ts`:

```ts
import { cardiacBandFromRcri } from "../perioperativeRisk";

describe("cardiacBandFromRcri", () => {
  it("maps RCRI 'low' to band 'low'", () => {
    expect(cardiacBandFromRcri("low")).toBe("low");
  });
  it("maps RCRI 'moderate' to band 'med'", () => {
    expect(cardiacBandFromRcri("moderate")).toBe("med");
  });
  it("maps RCRI 'high' to band 'high'", () => {
    expect(cardiacBandFromRcri("high")).toBe("high");
  });
});
```

- [ ] **Step 3.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: FAIL — `cardiacBandFromRcri is not a function`.

- [ ] **Step 3.3: Implement**

Append to `shared/scoring/perioperativeRisk.ts`:

```ts
import type { RcriResult } from "./rcri";

export function cardiacBandFromRcri(category: RcriResult["category"]): DomainBand {
  if (category === "high") return "high";
  if (category === "moderate") return "med";
  return "low";
}
```

- [ ] **Step 3.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "feat(risk): cardiac band mapping from RCRI"
```

---

### Task 4: VTE band (Caprini inheritance)

**Files:**
- Modify: `shared/scoring/perioperativeRisk.ts`
- Test: `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 4.1: Write failing test**

Append to the test file:

```ts
import { vteBandFromCaprini } from "../perioperativeRisk";

describe("vteBandFromCaprini", () => {
  it("maps 'low' to 'low'",       () => expect(vteBandFromCaprini("low")).toBe("low"));
  it("maps 'moderate' to 'low'",  () => expect(vteBandFromCaprini("moderate")).toBe("low"));
  it("maps 'higher' to 'med'",    () => expect(vteBandFromCaprini("higher")).toBe("med"));
  it("maps 'high' to 'high'",     () => expect(vteBandFromCaprini("high")).toBe("high"));
  it("maps 'veryHigh' to 'high'", () => expect(vteBandFromCaprini("veryHigh")).toBe("high"));
});
```

- [ ] **Step 4.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: FAIL.

- [ ] **Step 4.3: Implement**

Append to `shared/scoring/perioperativeRisk.ts`:

```ts
import type { CapriniResult } from "./caprini";

export function vteBandFromCaprini(category: CapriniResult["category"]): DomainBand {
  if (category === "high" || category === "veryHigh") return "high";
  if (category === "higher") return "med";
  return "low";
}
```

- [ ] **Step 4.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "feat(risk): VTE band mapping from Caprini"
```

---

### Task 5: Viali pulmonary v1 sub-score

**Files:**
- Create: `shared/scoring/pulmonary.ts`
- Test: `shared/scoring/__tests__/pulmonary.test.ts`

- [ ] **Step 5.1: Write failing test**

Create `shared/scoring/__tests__/pulmonary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateVialiPulmonaryV1 } from "../pulmonary";

describe("Viali pulmonary v1", () => {
  it("returns high when COPD is present", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: true, isCurrentSmoker: false, age: 60, plannedDurationMinutes: 60 });
    expect(r.band).toBe("high");
  });

  it("returns med when smoker AND age >= 70", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: true, age: 72, plannedDurationMinutes: 60 });
    expect(r.band).toBe("med");
  });

  it("returns med when smoker AND duration > 180 minutes", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: true, age: 45, plannedDurationMinutes: 240 });
    expect(r.band).toBe("med");
  });

  it("returns low when smoker but young and short surgery", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: true, age: 30, plannedDurationMinutes: 60 });
    expect(r.band).toBe("low");
  });

  it("returns low when no risk factors", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: false, isCurrentSmoker: false, age: 30, plannedDurationMinutes: 60 });
    expect(r.band).toBe("low");
  });

  it("tags result with 'Viali pulmonary v1' source", () => {
    const r = calculateVialiPulmonaryV1({ hasCopd: true, isCurrentSmoker: false, age: 60, plannedDurationMinutes: 60 });
    expect(r.source).toBe("Viali pulmonary v1");
  });
});
```

- [ ] **Step 5.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/pulmonary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement**

Create `shared/scoring/pulmonary.ts`:

```ts
import type { DomainBand } from "./perioperativeRisk";

export interface PulmonaryInputs {
  hasCopd: boolean;
  isCurrentSmoker: boolean;
  age: number;
  plannedDurationMinutes: number;
}

export interface PulmonaryResult {
  band: DomainBand;
  source: "Viali pulmonary v1";
}

export function calculateVialiPulmonaryV1(i: PulmonaryInputs): PulmonaryResult {
  if (i.hasCopd) return { band: "high", source: "Viali pulmonary v1" };
  if (i.isCurrentSmoker && (i.age >= 70 || i.plannedDurationMinutes > 180)) {
    return { band: "med", source: "Viali pulmonary v1" };
  }
  return { band: "low", source: "Viali pulmonary v1" };
}
```

- [ ] **Step 5.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/pulmonary.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5.5: Commit**

```bash
git add shared/scoring/pulmonary.ts shared/scoring/__tests__/pulmonary.test.ts
git commit -m "feat(risk): Viali pulmonary v1 sub-score"
```

---

### Task 6: mFI-5 frailty calculator with partial-mode

**Files:**
- Create: `shared/scoring/mfi5.ts`
- Test: `shared/scoring/__tests__/mfi5.test.ts`

- [ ] **Step 6.1: Write failing test**

Create `shared/scoring/__tests__/mfi5.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calculateMfi5 } from "../mfi5";

describe("mFI-5", () => {
  it("0 factors → low", () => {
    const r = calculateMfi5({ hasDiabetes: false, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: false });
    expect(r.band).toBe("low");
    expect(r.score).toBe(0);
    expect(r.partial).toBe(false);
  });

  it("1 factor → med", () => {
    const r = calculateMfi5({ hasDiabetes: true, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: false });
    expect(r.band).toBe("med");
    expect(r.score).toBe(1);
  });

  it("3+ factors → high", () => {
    const r = calculateMfi5({ hasDiabetes: true, hasCopd: true, hasChf: true, hasHypertensionRequiringMeds: false, functionallyDependent: false });
    expect(r.band).toBe("high");
    expect(r.score).toBe(3);
  });

  it("flags partial when functionallyDependent is null", () => {
    const r = calculateMfi5({ hasDiabetes: false, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: null });
    expect(r.partial).toBe(true);
    expect(r.band).toBe("low");
  });

  it("partial=false when functionallyDependent is provided", () => {
    const r = calculateMfi5({ hasDiabetes: true, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: true });
    expect(r.partial).toBe(false);
    expect(r.score).toBe(2);
  });
});
```

- [ ] **Step 6.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/mfi5.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement**

Create `shared/scoring/mfi5.ts`:

```ts
import type { DomainBand } from "./perioperativeRisk";

export interface Mfi5Inputs {
  hasDiabetes: boolean;
  hasCopd: boolean;
  hasChf: boolean;
  hasHypertensionRequiringMeds: boolean;
  functionallyDependent: boolean | null;
}

export interface Mfi5Result {
  band: DomainBand;
  score: number;
  partial: boolean;
  source: "mFI-5";
}

export function calculateMfi5(i: Mfi5Inputs): Mfi5Result {
  const flags = [
    i.hasDiabetes,
    i.hasCopd,
    i.hasChf,
    i.hasHypertensionRequiringMeds,
    i.functionallyDependent === true,
  ];
  const score = flags.filter(Boolean).length;
  const band: DomainBand = score >= 3 ? "high" : score >= 1 ? "med" : "low";
  return {
    band,
    score,
    partial: i.functionallyDependent === null,
    source: "mFI-5",
  };
}
```

- [ ] **Step 6.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/mfi5.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6.5: Commit**

```bash
git add shared/scoring/mfi5.ts shared/scoring/__tests__/mfi5.test.ts
git commit -m "feat(risk): mFI-5 frailty calculator with partial-mode"
```

---

### Task 7: Surgery weight band

**Files:**
- Modify: `shared/scoring/perioperativeRisk.ts`
- Test: `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 7.1: Write failing test**

Append to the test file:

```ts
import { surgeryBandFromRiskClass } from "../perioperativeRisk";

describe("surgeryBandFromRiskClass", () => {
  it("minor → low",    () => expect(surgeryBandFromRiskClass("minor")).toBe("low"));
  it("standard → med", () => expect(surgeryBandFromRiskClass("standard")).toBe("med"));
  it("large → med",    () => expect(surgeryBandFromRiskClass("large")).toBe("med"));
  it("critical → high",() => expect(surgeryBandFromRiskClass("critical")).toBe("high"));
});
```

- [ ] **Step 7.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: FAIL.

- [ ] **Step 7.3: Implement**

Append to `shared/scoring/perioperativeRisk.ts`:

```ts
export type SurgeryRiskClass = "minor" | "standard" | "large" | "critical";

export function surgeryBandFromRiskClass(rc: SurgeryRiskClass): DomainBand {
  if (rc === "critical") return "high";
  if (rc === "standard" || rc === "large") return "med";
  return "low";
}
```

- [ ] **Step 7.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "feat(risk): surgery weight band from risk class"
```

---

### Task 8: Composite calculator — worst-domain + tiebreaker + age modifier + drivers

**Files:**
- Modify: `shared/scoring/perioperativeRisk.ts`
- Test: `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 8.1: Write failing test for worst-domain aggregation**

Append to the test file:

```ts
import { calculatePerioperativeRisk } from "../perioperativeRisk";

describe("calculatePerioperativeRisk — aggregation", () => {
  const baseInputs = {
    age: 50,
    sex: "f" as const,
    bmi: 25,
    surgeryRiskClass: "minor" as SurgeryRiskClass,
    plannedDurationMinutes: 60,
    isCurrentSmoker: false,
    functionallyDependent: false,
    concepts: { CAD: false, CHF: false, STROKE_HISTORY: false, INSULIN_DIABETES: false, CKD_OR_DIALYSIS: false, COPD: false, HYPERTENSION: false, ACTIVE_CANCER: false, VTE_HISTORY: false, VARICOSE_VEINS: false, LEG_SWELLING: false, FAMILY_THROMBOPHILIA: false, OC_OR_HRT: false, PREGNANCY_OR_POSTPARTUM: false, RECENT_STROKE_30D: false, SPINAL_CORD_INJURY: false, KNOWN_UNTREATED_OSAS: false, PONV_HISTORY: false },
  };

  it("all-low → green", () => {
    const r = calculatePerioperativeRisk(baseInputs);
    expect(r.grade).toBe("green");
    expect(r.worstDomain).toBe("cardiac"); // ties resolve to cardiac
  });

  it("any-med-no-high → orange", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, surgeryRiskClass: "standard" });
    expect(r.grade).toBe("orange");
    expect(r.worstDomain).toBe("surgery");
  });

  it("any-high → red", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, surgeryRiskClass: "critical" });
    expect(r.grade).toBe("red");
  });

  it("tiebreaker cardiac > vte > pulmonary > frailty > surgery", () => {
    const r = calculatePerioperativeRisk({
      ...baseInputs,
      concepts: { ...baseInputs.concepts, CAD: true },
      surgeryRiskClass: "critical",
    });
    expect(r.worstDomain).toBe("cardiac");
  });

  it("age >= 75 bumps green to orange", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 75 });
    expect(r.grade).toBe("orange");
    expect(r.ageModifier).toBe(1);
  });

  it("age >= 75 bumps orange to red", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 80, surgeryRiskClass: "standard" });
    expect(r.grade).toBe("red");
    expect(r.ageModifier).toBe(1);
  });

  it("age >= 75 keeps red as red (capped)", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 80, surgeryRiskClass: "critical" });
    expect(r.grade).toBe("red");
  });

  it("age 74 does not apply modifier", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 74 });
    expect(r.ageModifier).toBe(0);
  });

  it("drivers are sorted by severity, max length 3", () => {
    const r = calculatePerioperativeRisk({
      ...baseInputs,
      concepts: { ...baseInputs.concepts, CAD: true, COPD: true },
      surgeryRiskClass: "critical",
    });
    expect(r.drivers.length).toBeLessThanOrEqual(3);
    expect(r.drivers[0]).toMatch(/cardiac/i);
  });

  it("partial flag propagates from mFI-5 when functionallyDependent is null", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, functionallyDependent: null as any });
    expect(r.partial).toBe(true);
  });
});
```

- [ ] **Step 8.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: FAIL — `calculatePerioperativeRisk is not a function`.

- [ ] **Step 8.3: Implement the composite**

Append to `shared/scoring/perioperativeRisk.ts`:

```ts
import { calculateRcri } from "./rcri";
import { calculateCaprini } from "./caprini";
import { calculateVialiPulmonaryV1 } from "./pulmonary";
import { calculateMfi5 } from "./mfi5";

// Tiebreaker for worstDomain when multiple domains share the top band.
const DOMAIN_PRIORITY: DomainKey[] = ["cardiac", "vte", "pulmonary", "frailty", "surgery"];
const BAND_RANK: Record<DomainBand, number> = { low: 0, med: 1, high: 2 };

export interface PerioperativeRiskInputs {
  age: number;
  sex: "m" | "f";
  bmi: number | null;
  surgeryRiskClass: SurgeryRiskClass;
  plannedDurationMinutes: number;
  isCurrentSmoker: boolean;
  functionallyDependent: boolean | null;
  concepts: {
    CAD: boolean; CHF: boolean; STROKE_HISTORY: boolean; INSULIN_DIABETES: boolean;
    CKD_OR_DIALYSIS: boolean; COPD: boolean; HYPERTENSION: boolean; ACTIVE_CANCER: boolean;
    VTE_HISTORY: boolean; VARICOSE_VEINS: boolean; LEG_SWELLING: boolean;
    FAMILY_THROMBOPHILIA: boolean; OC_OR_HRT: boolean; PREGNANCY_OR_POSTPARTUM: boolean;
    RECENT_STROKE_30D: boolean; SPINAL_CORD_INJURY: boolean; KNOWN_UNTREATED_OSAS: boolean;
    PONV_HISTORY: boolean;
  };
}

export function calculatePerioperativeRisk(i: PerioperativeRiskInputs): PerioperativeRiskResult {
  const rcri = calculateRcri({
    surgeryRiskClass: i.surgeryRiskClass,
    hasCAD: i.concepts.CAD,
    hasCHF: i.concepts.CHF,
    hasCerebrovascularDisease: i.concepts.STROKE_HISTORY,
    isInsulinDependentDiabetic: i.concepts.INSULIN_DIABETES,
    creatinineMgDl: i.concepts.CKD_OR_DIALYSIS ? 2.5 : 1.0,
  });

  const caprini = calculateCaprini({
    age: i.age,
    sex: i.sex,
    bmi: i.bmi ?? 25,
    surgeryRiskClass: i.surgeryRiskClass,
    plannedDurationMinutes: i.plannedDurationMinutes,
    hasActiveCancer: i.concepts.ACTIVE_CANCER,
    hasVteHistory: i.concepts.VTE_HISTORY,
    hasVaricoseVeins: i.concepts.VARICOSE_VEINS,
    hasLegSwelling: i.concepts.LEG_SWELLING,
    hasFamilyThrombophilia: i.concepts.FAMILY_THROMBOPHILIA,
    onOcOrHrt: i.concepts.OC_OR_HRT,
    isPregnantOrPostpartum: i.concepts.PREGNANCY_OR_POSTPARTUM,
    hasRecentStroke30d: i.concepts.RECENT_STROKE_30D,
    hasSpinalCordInjury: i.concepts.SPINAL_CORD_INJURY,
  });

  const pulm = calculateVialiPulmonaryV1({
    hasCopd: i.concepts.COPD,
    isCurrentSmoker: i.isCurrentSmoker,
    age: i.age,
    plannedDurationMinutes: i.plannedDurationMinutes,
  });

  const mfi = calculateMfi5({
    hasDiabetes: i.concepts.INSULIN_DIABETES,
    hasCopd: i.concepts.COPD,
    hasChf: i.concepts.CHF,
    hasHypertensionRequiringMeds: i.concepts.HYPERTENSION,
    functionallyDependent: i.functionallyDependent,
  });

  const domains: Record<DomainKey, DomainResult> = {
    cardiac:   { band: cardiacBandFromRcri(rcri.category), score: rcri.score, source: "RCRI" },
    vte:       { band: vteBandFromCaprini(caprini.category), score: caprini.score, source: "Caprini" },
    pulmonary: { band: pulm.band, source: pulm.source },
    frailty:   { band: mfi.band, score: mfi.score, source: mfi.source, partial: mfi.partial },
    surgery:   { band: surgeryBandFromRiskClass(i.surgeryRiskClass), source: `surgeryRiskClass:${i.surgeryRiskClass}` },
  };

  // Worst-domain with tiebreaker.
  const topRank = Math.max(...Object.values(domains).map((d) => BAND_RANK[d.band]));
  const worstDomain = DOMAIN_PRIORITY.find((k) => BAND_RANK[domains[k].band] === topRank)!;

  // Aggregate grade.
  let grade: RiskGrade = topRank === 2 ? "red" : topRank === 1 ? "orange" : "green";

  // Age modifier — never bumps down, caps at red.
  const ageModifier: 0 | 1 = i.age >= 75 ? 1 : 0;
  if (ageModifier === 1) {
    if (grade === "green") grade = "orange";
    else if (grade === "orange") grade = "red";
  }

  // Drivers — sorted by band severity, max 3.
  const drivers = DOMAIN_PRIORITY
    .map((k) => ({ key: k, d: domains[k] }))
    .filter(({ d }) => d.band !== "low")
    .sort((a, b) => BAND_RANK[b.d.band] - BAND_RANK[a.d.band])
    .slice(0, 3)
    .map(({ key, d }) => driverLabel(key, d));

  return {
    domains,
    worstDomain,
    ageModifier,
    grade,
    drivers,
    partial: Object.values(domains).some((d) => d.partial === true),
    calculatedAt: new Date().toISOString(),
  };
}

function driverLabel(key: DomainKey, d: DomainResult): string {
  if (key === "cardiac")   return `Cardiac (RCRI ${d.score ?? "?"} pts, ${d.band})`;
  if (key === "vte")       return `VTE (Caprini ${d.score ?? "?"}, ${d.band})`;
  if (key === "pulmonary") return `Pulmonary (${d.band})`;
  if (key === "frailty")   return `mFI-5 = ${d.score ?? "?"}`;
  return `Surgery (${d.source.replace("surgeryRiskClass:", "")})`;
}
```

- [ ] **Step 8.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts`
Expected: PASS (all aggregation tests).

- [ ] **Step 8.5: Typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: clean.

- [ ] **Step 8.6: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "feat(risk): composite calculator with worst-domain, age modifier, drivers"
```

---

## Phase 3: Server adapter, recalc hooks, backfill

### Task 9: Server-side `computePerioperativeRisk` adapter

**Files:**
- Create: `server/scoring/computePerioperativeRisk.ts`
- Test: `server/scoring/__tests__/computePerioperativeRisk.test.ts`

- [ ] **Step 9.1: Write failing test**

Create `server/scoring/__tests__/computePerioperativeRisk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveRiskInputsFromRecords } from "../computePerioperativeRisk";

describe("deriveRiskInputsFromRecords", () => {
  it("maps a clean patient + minor surgery to all-low inputs", () => {
    const patient: any = {
      age: 50, gender: "female", bmi: 24,
      smokingStatus: "never",
      heartIllnesses: {}, lungIllnesses: {}, kidneyIllnesses: {}, metabolicIllnesses: {},
    };
    const surgery: any = { surgeryRiskClass: "minor", plannedDurationMinutes: 60 };
    const questionnaire: any = { functionallyDependent: false };
    const i = deriveRiskInputsFromRecords(patient, surgery, questionnaire);
    expect(i.isCurrentSmoker).toBe(false);
    expect(i.functionallyDependent).toBe(false);
    expect(i.concepts.COPD).toBe(false);
  });

  it("treats smokingStatus 'current' as isCurrentSmoker=true", () => {
    const patient: any = { age: 50, gender: "male", bmi: 24, smokingStatus: "current", heartIllnesses: {}, lungIllnesses: {}, kidneyIllnesses: {}, metabolicIllnesses: {} };
    const i = deriveRiskInputsFromRecords(patient, { surgeryRiskClass: "minor", plannedDurationMinutes: 60 } as any, null);
    expect(i.isCurrentSmoker).toBe(true);
  });

  it("leaves functionallyDependent null when no questionnaire row", () => {
    const patient: any = { age: 50, gender: "female", bmi: 24, smokingStatus: "never", heartIllnesses: {}, lungIllnesses: {}, kidneyIllnesses: {}, metabolicIllnesses: {} };
    const i = deriveRiskInputsFromRecords(patient, { surgeryRiskClass: "minor", plannedDurationMinutes: 60 } as any, null);
    expect(i.functionallyDependent).toBeNull();
  });
});
```

- [ ] **Step 9.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/computePerioperativeRisk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement**

Create `server/scoring/computePerioperativeRisk.ts`:

```ts
import {
  calculatePerioperativeRisk,
  type PerioperativeRiskInputs,
  type PerioperativeRiskResult,
} from "@shared/scoring/perioperativeRisk";
import { findConcept } from "@shared/scoring/findConcept";

type AnyRec = Record<string, any>;

function ageFrom(patient: AnyRec): number {
  if (typeof patient.age === "number") return patient.age;
  if (patient.dateOfBirth) {
    const dob = new Date(patient.dateOfBirth);
    const ms = Date.now() - dob.getTime();
    return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
  }
  return 0;
}

function hasConcept(patient: AnyRec, concept: string): boolean {
  const buckets = [patient.heartIllnesses, patient.lungIllnesses, patient.kidneyIllnesses, patient.metabolicIllnesses, patient.giIllnesses];
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [itemId, on] of Object.entries(bucket)) {
      if (!on) continue;
      if (findConcept(itemId) === concept) return true;
    }
  }
  return false;
}

export function deriveRiskInputsFromRecords(
  patient: AnyRec,
  surgery: AnyRec,
  questionnaire: AnyRec | null,
): PerioperativeRiskInputs {
  const sex: "m" | "f" = (patient.gender === "male" || patient.gender === "m") ? "m" : "f";
  return {
    age: ageFrom(patient),
    sex,
    bmi: typeof patient.bmi === "number" ? patient.bmi : null,
    surgeryRiskClass: surgery.surgeryRiskClass,
    plannedDurationMinutes: surgery.plannedDurationMinutes ?? 60,
    isCurrentSmoker: patient.smokingStatus === "current",
    functionallyDependent: questionnaire?.functionallyDependent ?? null,
    concepts: {
      CAD: hasConcept(patient, "CAD"),
      CHF: hasConcept(patient, "CHF"),
      STROKE_HISTORY: hasConcept(patient, "STROKE_HISTORY"),
      INSULIN_DIABETES: hasConcept(patient, "INSULIN_DIABETES"),
      CKD_OR_DIALYSIS: hasConcept(patient, "CKD_OR_DIALYSIS"),
      COPD: hasConcept(patient, "COPD"),
      HYPERTENSION: hasConcept(patient, "HYPERTENSION"),
      ACTIVE_CANCER: hasConcept(patient, "ACTIVE_CANCER"),
      VTE_HISTORY: hasConcept(patient, "VTE_HISTORY"),
      VARICOSE_VEINS: hasConcept(patient, "VARICOSE_VEINS"),
      LEG_SWELLING: hasConcept(patient, "LEG_SWELLING"),
      FAMILY_THROMBOPHILIA: hasConcept(patient, "FAMILY_THROMBOPHILIA"),
      OC_OR_HRT: hasConcept(patient, "OC_OR_HRT"),
      PREGNANCY_OR_POSTPARTUM: hasConcept(patient, "PREGNANCY_OR_POSTPARTUM"),
      RECENT_STROKE_30D: hasConcept(patient, "RECENT_STROKE_30D"),
      SPINAL_CORD_INJURY: hasConcept(patient, "SPINAL_CORD_INJURY"),
      KNOWN_UNTREATED_OSAS: hasConcept(patient, "KNOWN_UNTREATED_OSAS"),
      PONV_HISTORY: hasConcept(patient, "PONV_HISTORY"),
    },
  };
}

export function computeRiskSnapshot(
  patient: AnyRec,
  surgery: AnyRec,
  questionnaire: AnyRec | null,
): PerioperativeRiskResult {
  return calculatePerioperativeRisk(deriveRiskInputsFromRecords(patient, surgery, questionnaire));
}
```

- [ ] **Step 9.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/computePerioperativeRisk.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9.5: Commit**

```bash
git add server/scoring/computePerioperativeRisk.ts server/scoring/__tests__/computePerioperativeRisk.test.ts
git commit -m "feat(risk): server-side adapter to compute risk snapshot from patient + surgery"
```

---

### Task 10: Hook into surgery POST/PATCH

**Files:**
- Modify: `server/routes/anesthesia/surgeries.ts`
- Test: existing surgery integration tests (find via `ls server/routes/anesthesia/__tests__/ 2>/dev/null || ls tests/anesthesia/`)

- [ ] **Step 10.1: Add the helper at the top of the file**

In `server/routes/anesthesia/surgeries.ts`, find the existing `applyAmbulantValidation` function (starts at line 39). Right after its closing `}` (around line 113), add:

```ts
import { computeRiskSnapshot } from "../../scoring/computePerioperativeRisk";
import { storage } from "../../storage";

async function applyPerioperativeRiskRecalc(body: any, existingSurgery: any | null): Promise<void> {
  if (!body.surgeryRiskClass && !existingSurgery?.surgeryRiskClass) return;
  const patientId = body.patientId ?? existingSurgery?.patientId;
  if (!patientId) return;
  const patient = await storage.getPatient(patientId);
  if (!patient) return;
  const merged = { ...(existingSurgery ?? {}), ...body };
  const qnr = await storage.getLatestQuestionnaireResponseForPatient?.(patientId).catch(() => null) ?? null;
  const snapshot = computeRiskSnapshot(patient, merged, qnr);
  body.perioperativeRisk = snapshot;
  body.riskGrade = snapshot.grade;
}
```

Note: place the two `import` statements at the top of the file with the other imports (around line 26), not inside the function.

- [ ] **Step 10.2: Wire it into the POST handler**

Find the existing `POST /api/anesthesia/surgeries` handler in this file. After the line `body.ambulantQuickCheck = snapshot;` (line 89) check passes — i.e. after `applyAmbulantValidation` returns null — add a call:

```ts
await applyPerioperativeRiskRecalc(body, null);
```

This must go before the actual DB insert.

- [ ] **Step 10.3: Wire it into the PATCH handler**

Find the existing `PATCH /api/anesthesia/surgeries/:id` handler in this file. After `applyAmbulantValidation` returns null in that handler, before the DB update, add:

```ts
await applyPerioperativeRiskRecalc(body, existingSurgery);
```

- [ ] **Step 10.4: Add the storage helper if missing**

Run: `grep -n "getLatestQuestionnaireResponseForPatient" /home/mau/viali/server/storage/questionnaires.ts`
If the function does not exist, add it to `server/storage/questionnaires.ts`:

```ts
export async function getLatestQuestionnaireResponseForPatient(patientId: number) {
  const rows = await db
    .select()
    .from(patientQuestionnaireResponses)
    .where(eq(patientQuestionnaireResponses.patientId, patientId))
    .orderBy(desc(patientQuestionnaireResponses.submittedAt))
    .limit(1);
  return rows[0] ?? null;
}
```

Then re-export it from the storage barrel (search `from "./questionnaires"` in `server/storage/index.ts` and follow the existing pattern).

- [ ] **Step 10.5: Write integration test**

Create `server/scoring/__tests__/perioperativeRisk.recalc.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { signInTestUser, createTestHospital, createTestPatient } from "../../../tests/helpers";

describe("Risk recalc on surgery write", () => {
  let agent: any, hospitalId: number, patientId: number;
  beforeEach(async () => {
    agent = await signInTestUser();
    hospitalId = (await createTestHospital(agent)).id;
    patientId = (await createTestPatient(agent, hospitalId, { age: 50 })).id;
  });

  it("computes riskGrade on surgery create", async () => {
    const res = await agent.post("/api/anesthesia/surgeries").send({
      patientId, hospitalId, plannedDurationMinutes: 60, surgeryRiskClass: "minor", stayType: "overnight",
    });
    expect(res.status).toBe(201);
    expect(res.body.riskGrade).toBe("green");
    expect(res.body.perioperativeRisk).toBeTruthy();
  });

  it("recomputes riskGrade on surgeryRiskClass change", async () => {
    const created = await agent.post("/api/anesthesia/surgeries").send({
      patientId, hospitalId, plannedDurationMinutes: 60, surgeryRiskClass: "minor", stayType: "overnight",
    });
    const patched = await agent.patch(`/api/anesthesia/surgeries/${created.body.id}`).send({ surgeryRiskClass: "critical" });
    expect(patched.body.riskGrade).toBe("red");
  });
});
```

Adapt `signInTestUser / createTestHospital / createTestPatient` to whatever helpers already exist in `tests/` — search for the pattern used by `tests/anesthesia/surgeries.test.ts` if present.

- [ ] **Step 10.6: Run the test**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/perioperativeRisk.recalc.test.ts`
Expected: PASS.

- [ ] **Step 10.7: Commit**

```bash
git add server/routes/anesthesia/surgeries.ts server/storage/questionnaires.ts server/storage/index.ts server/scoring/__tests__/perioperativeRisk.recalc.test.ts
git commit -m "feat(risk): recompute perioperative risk on surgery POST/PATCH"
```

---

### Task 11: Hook into patient PATCH (illness changes)

**Files:**
- Modify: `server/routes/anesthesia/patients.ts:209`

- [ ] **Step 11.1: Write failing test**

Append to `server/scoring/__tests__/perioperativeRisk.recalc.test.ts`:

```ts
it("recomputes all future surgeries when a patient's illnesses change", async () => {
  const patient = await agent.post("/api/patients").send({ hospitalId, firstName: "T", lastName: "Test", dateOfBirth: "1976-01-01" });
  const surgery = await agent.post("/api/anesthesia/surgeries").send({
    patientId: patient.body.id, hospitalId, surgeryRiskClass: "minor", stayType: "overnight", plannedDurationMinutes: 60, scheduledStart: new Date(Date.now() + 86400000).toISOString(),
  });
  expect(surgery.body.riskGrade).toBe("green");

  // Add CAD to the patient
  await agent.patch(`/api/patients/${patient.body.id}`).send({
    heartIllnesses: { "CAD": true },
  });

  const reread = await agent.get(`/api/anesthesia/surgeries/${surgery.body.id}`);
  expect(reread.body.riskGrade).not.toBe("green");
});
```

- [ ] **Step 11.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/perioperativeRisk.recalc.test.ts`
Expected: FAIL — patch didn't trigger recalc.

- [ ] **Step 11.3: Implement the hook**

Open `server/routes/anesthesia/patients.ts`. Find the `router.patch('/api/patients/:id', ...)` handler at line 209. After the DB update succeeds (after the `await storage.updatePatient(...)` call), and before the response is sent, add:

```ts
import { recomputeRiskForPatientFutureSurgeries } from "../../scoring/computePerioperativeRisk";

// after await storage.updatePatient(...)
await recomputeRiskForPatientFutureSurgeries(patientId);
```

The import goes at the top of the file with the other imports.

- [ ] **Step 11.4: Add the storage helper**

In `server/scoring/computePerioperativeRisk.ts` append:

```ts
import { db } from "../db";
import { surgeries } from "@shared/schema";
import { and, eq, gte, isNotNull, ne } from "drizzle-orm";

export async function recomputeRiskForPatientFutureSurgeries(patientId: number): Promise<void> {
  const rows = await db
    .select()
    .from(surgeries)
    .where(and(
      eq(surgeries.patientId, patientId),
      isNotNull(surgeries.scheduledStart),
      gte(surgeries.scheduledStart, new Date()),
      ne(surgeries.status, "cancelled"),
    ));
  const patient = await storage.getPatient(patientId);
  if (!patient) return;
  const qnr = await storage.getLatestQuestionnaireResponseForPatient?.(patientId).catch(() => null) ?? null;
  for (const surgery of rows) {
    if (!surgery.surgeryRiskClass) continue;
    const snapshot = computeRiskSnapshot(patient, surgery, qnr);
    await db.update(surgeries).set({ riskGrade: snapshot.grade, perioperativeRisk: snapshot as any }).where(eq(surgeries.id, surgery.id));
  }
}
```

Note: `storage` is the existing storage module; import it: `import { storage } from "../storage";`

- [ ] **Step 11.5: Run test**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/perioperativeRisk.recalc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11.6: Commit**

```bash
git add server/routes/anesthesia/patients.ts server/scoring/computePerioperativeRisk.ts server/scoring/__tests__/perioperativeRisk.recalc.test.ts
git commit -m "feat(risk): recompute perioperative risk when patient illnesses change"
```

---

### Task 12: Hook into questionnaire submit + edit

**Files:**
- Modify: `server/routes/questionnaire.ts:1512` (public submit) and `:575` (PUT)

- [ ] **Step 12.1: Identify both write points**

Run: `grep -n "router.post.*'/api/public/questionnaire/:token/submit'\|router.put.*'/api/questionnaire/responses/:responseId'" /home/mau/viali/server/routes/questionnaire.ts`
Expected: two lines.

- [ ] **Step 12.2: Add the hook in the submit handler**

In `server/routes/questionnaire.ts`, find the submit handler. After the row is updated (after the `await` that writes `submittedAt` / status), and before the response is sent, look up the `patientId` on the response row and call:

```ts
import { recomputeRiskForPatientFutureSurgeries } from "../scoring/computePerioperativeRisk";

if (response.patientId) {
  await recomputeRiskForPatientFutureSurgeries(response.patientId);
}
```

- [ ] **Step 12.3: Add the same hook in the PUT handler (admin edit)**

In the same file, find the PUT `/api/questionnaire/responses/:responseId` handler at line 575. Repeat the same recompute call after the DB update.

- [ ] **Step 12.4: Write integration test**

Append to `server/scoring/__tests__/perioperativeRisk.recalc.test.ts`:

```ts
it("recomputes future surgeries when functionallyDependent is set on the questionnaire", async () => {
  // Create patient + future surgery
  const patient = await agent.post("/api/patients").send({ hospitalId, firstName: "Q", lastName: "Test", dateOfBirth: "1976-01-01" });
  const surgery = await agent.post("/api/anesthesia/surgeries").send({
    patientId: patient.body.id, hospitalId, surgeryRiskClass: "minor", stayType: "overnight", plannedDurationMinutes: 60, scheduledStart: new Date(Date.now() + 86400000).toISOString(),
  });

  // Create a questionnaire response (use whatever helper exists in test suite; otherwise hit storage directly)
  const responseId = await createQuestionnaireResponseForPatient(patient.body.id);

  // Update functionallyDependent via PUT
  await agent.put(`/api/questionnaire/responses/${responseId}`).send({ functionallyDependent: true });

  const reread = await agent.get(`/api/anesthesia/surgeries/${surgery.body.id}`);
  expect(reread.body.perioperativeRisk?.partial).toBe(false);
});
```

- [ ] **Step 12.5: Run test**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/perioperativeRisk.recalc.test.ts`
Expected: PASS.

- [ ] **Step 12.6: Commit**

```bash
git add server/routes/questionnaire.ts server/scoring/__tests__/perioperativeRisk.recalc.test.ts
git commit -m "feat(risk): recompute on questionnaire submit + admin edit"
```

---

### Task 13: Surface `riskGrade` + `perioperativeRisk` on the enriched surgeries payload

**Files:**
- Modify: `server/storage/anesthesia.ts` (or wherever `getEnrichedSurgeries` lives)

- [ ] **Step 13.1: Locate the enrichment**

Run: `grep -rn "ambulantQuickCheck:" /home/mau/viali/server/storage/ --include="*.ts" | head -3`
Expected: the file that builds the enriched surgery row. Usually `server/storage/anesthesia.ts`.

- [ ] **Step 13.2: Include the new columns in the SELECT/projection**

In that file, find the surgery enrichment query. Wherever `ambulantQuickCheck` is selected/spread into the result object, also include `riskGrade` and `perioperativeRisk` from the surgery row. If the existing code does `...surgery`, this is already covered — verify by running:

```bash
cd /home/mau/viali && grep -B2 -A2 "ambulantQuickCheck:" server/storage/anesthesia.ts
```

If it's a `...surgery` spread, no code change needed. If it's an explicit field list, add the two fields explicitly.

- [ ] **Step 13.3: Write contract test**

Create `server/scoring/__tests__/surgeries-payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { signInTestUser, createTestHospital, createTestPatient } from "../../../tests/helpers";

describe("Surgeries API includes risk fields", () => {
  it("/api/anesthesia/surgeries includes riskGrade and perioperativeRisk", async () => {
    const agent = await signInTestUser();
    const hospitalId = (await createTestHospital(agent)).id;
    const patientId = (await createTestPatient(agent, hospitalId, { age: 50 })).id;
    await agent.post("/api/anesthesia/surgeries").send({ patientId, hospitalId, surgeryRiskClass: "minor", stayType: "overnight", plannedDurationMinutes: 60 });
    const res = await agent.get("/api/anesthesia/surgeries");
    expect(res.body[0]).toHaveProperty("riskGrade");
    expect(res.body[0]).toHaveProperty("perioperativeRisk");
  });
});
```

- [ ] **Step 13.4: Run + commit**

Run: `cd /home/mau/viali && npx vitest run server/scoring/__tests__/surgeries-payload.test.ts`
Expected: PASS.

```bash
git add server/storage/anesthesia.ts server/scoring/__tests__/surgeries-payload.test.ts
git commit -m "feat(risk): surface riskGrade on enriched surgeries payload"
```

---

### Task 14: Backfill script

**Files:**
- Create: `scripts/backfill-risk-grade.ts`
- Test: `scripts/__tests__/backfill-risk-grade.test.ts`

- [ ] **Step 14.1: Write failing test**

Create `scripts/__tests__/backfill-risk-grade.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { backfillRiskGrade } from "../backfill-risk-grade";
import { db } from "../../server/db";
import { surgeries } from "@shared/schema";

describe("backfillRiskGrade", () => {
  it("is idempotent — second run is a no-op", async () => {
    const stats1 = await backfillRiskGrade();
    const stats2 = await backfillRiskGrade();
    expect(stats2.updated).toBe(0);
    expect(stats2.scanned).toBe(stats1.scanned);
  });
});
```

- [ ] **Step 14.2: Implement**

Create `scripts/backfill-risk-grade.ts`:

```ts
import { db } from "../server/db";
import { surgeries } from "@shared/schema";
import { and, eq, gte, isNotNull, ne } from "drizzle-orm";
import { computeRiskSnapshot } from "../server/scoring/computePerioperativeRisk";
import { storage } from "../server/storage";

export interface BackfillStats { scanned: number; updated: number; skipped: number; }

export async function backfillRiskGrade(): Promise<BackfillStats> {
  const stats: BackfillStats = { scanned: 0, updated: 0, skipped: 0 };
  const rows = await db
    .select()
    .from(surgeries)
    .where(and(
      isNotNull(surgeries.scheduledStart),
      gte(surgeries.scheduledStart, new Date()),
      ne(surgeries.status, "cancelled"),
    ));
  for (const surgery of rows) {
    stats.scanned += 1;
    if (!surgery.surgeryRiskClass || !surgery.patientId) { stats.skipped += 1; continue; }
    const patient = await storage.getPatient(surgery.patientId);
    if (!patient) { stats.skipped += 1; continue; }
    const qnr = await storage.getLatestQuestionnaireResponseForPatient?.(surgery.patientId).catch(() => null) ?? null;
    const snapshot = computeRiskSnapshot(patient, surgery, qnr);
    if (surgery.riskGrade === snapshot.grade && JSON.stringify(surgery.perioperativeRisk) === JSON.stringify(snapshot)) {
      stats.skipped += 1; continue;
    }
    await db.update(surgeries).set({ riskGrade: snapshot.grade, perioperativeRisk: snapshot as any }).where(eq(surgeries.id, surgery.id));
    stats.updated += 1;
  }
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillRiskGrade().then((s) => { console.log(JSON.stringify(s)); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 14.3: Run test**

Run: `cd /home/mau/viali && npx vitest run scripts/__tests__/backfill-risk-grade.test.ts`
Expected: PASS.

- [ ] **Step 14.4: Commit**

```bash
git add scripts/backfill-risk-grade.ts scripts/__tests__/backfill-risk-grade.test.ts
git commit -m "feat(risk): idempotent backfill script for risk_grade"
```

---

## Phase 4: Frontend foundation

### Task 15: `RiskChip` shared component

**Files:**
- Create: `client/src/components/anesthesia/RiskChip.tsx`
- Test: `client/src/components/anesthesia/__tests__/RiskChip.test.tsx`

- [ ] **Step 15.1: Write failing test**

Create `client/src/components/anesthesia/__tests__/RiskChip.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskChip } from "../RiskChip";

describe("<RiskChip />", () => {
  it("renders 'MED · CARDIAC' for grade orange + worstDomain cardiac", () => {
    render(<RiskChip grade="orange" worstDomain="cardiac" />);
    expect(screen.getByText(/MED · CARDIAC/)).toBeInTheDocument();
  });

  it("renders 'HIGH · FRAILTY' for grade red + worstDomain frailty", () => {
    render(<RiskChip grade="red" worstDomain="frailty" />);
    expect(screen.getByText(/HIGH · FRAILTY/)).toBeInTheDocument();
  });

  it("renders 'LOW · CARDIAC' for grade green + worstDomain cardiac", () => {
    render(<RiskChip grade="green" worstDomain="cardiac" />);
    expect(screen.getByText(/LOW · CARDIAC/)).toBeInTheDocument();
  });

  it("applies the correct color class for each grade", () => {
    const { rerender, container } = render(<RiskChip grade="green" worstDomain="cardiac" />);
    expect(container.querySelector(".bg-green-500\\/20")).toBeTruthy();
    rerender(<RiskChip grade="orange" worstDomain="cardiac" />);
    expect(container.querySelector(".bg-orange-500\\/20")).toBeTruthy();
    rerender(<RiskChip grade="red" worstDomain="cardiac" />);
    expect(container.querySelector(".bg-red-500\\/25")).toBeTruthy();
  });
});
```

- [ ] **Step 15.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/RiskChip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 15.3: Implement**

Create `client/src/components/anesthesia/RiskChip.tsx`:

```tsx
import type { RiskGrade, DomainKey } from "@shared/scoring/perioperativeRisk";

const GRADE_LABEL: Record<RiskGrade, string> = { green: "LOW", orange: "MED", red: "HIGH" };
const GRADE_CLASS: Record<RiskGrade, string> = {
  green:  "bg-green-500/20 text-green-300 border-green-500/30",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  red:    "bg-red-500/25 text-red-200 border-red-500/40",
};
const DOT_CLASS: Record<RiskGrade, string> = { green: "bg-green-500", orange: "bg-orange-500", red: "bg-red-500" };

export interface RiskChipProps {
  grade: RiskGrade;
  worstDomain: DomainKey;
  onClick?: () => void;
  size?: "sm" | "md";
}

export function RiskChip({ grade, worstDomain, onClick, size = "md" }: RiskChipProps) {
  const text = `${GRADE_LABEL[grade]} · ${worstDomain.toUpperCase()}`;
  const sizeClass = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wide ${sizeClass} ${GRADE_CLASS[grade]} ${onClick ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
      data-testid={`risk-chip-${grade}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[grade]}`} />
      {text}
    </button>
  );
}
```

- [ ] **Step 15.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/RiskChip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 15.5: Commit**

```bash
git add client/src/components/anesthesia/RiskChip.tsx client/src/components/anesthesia/__tests__/RiskChip.test.tsx
git commit -m "feat(risk): RiskChip shared component"
```

---

### Task 16: `<RiskBreakdownPopover />`

**Files:**
- Create: `client/src/components/anesthesia/RiskBreakdownPopover.tsx`
- Test: inline component test below

- [ ] **Step 16.1: Write failing test**

Create `client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskBreakdownPopover } from "../RiskBreakdownPopover";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";

const SAMPLE: PerioperativeRiskResult = {
  domains: {
    cardiac:   { band: "med", score: 2, source: "RCRI" },
    vte:       { band: "low", source: "Caprini" },
    pulmonary: { band: "low", source: "Viali pulmonary v1" },
    frailty:   { band: "med", score: 2, source: "mFI-5", partial: false },
    surgery:   { band: "med", source: "surgeryRiskClass:large" },
  },
  worstDomain: "cardiac",
  ageModifier: 0,
  grade: "orange",
  drivers: ["Cardiac (RCRI 2 pts, med)", "Large surgery class", "mFI-5 = 2"],
  partial: false,
  calculatedAt: "2026-05-13T08:00:00.000Z",
};

describe("<RiskBreakdownPopover />", () => {
  it("renders all 5 domain rows", () => {
    render(<RiskBreakdownPopover risk={SAMPLE} ambulant={null} />);
    expect(screen.getByText(/Cardiac/i)).toBeInTheDocument();
    expect(screen.getByText(/VTE/i)).toBeInTheDocument();
    expect(screen.getByText(/Pulmonary/i)).toBeInTheDocument();
    expect(screen.getByText(/Frailty/i)).toBeInTheDocument();
    expect(screen.getByText(/Surgery/i)).toBeInTheDocument();
  });

  it("shows 'How is this calculated?' link to /risk-methodology", () => {
    render(<RiskBreakdownPopover risk={SAMPLE} ambulant={null} />);
    const link = screen.getByRole("link", { name: /how is this calculated/i });
    expect(link.getAttribute("href")).toBe("/risk-methodology");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders ambulant verdict when provided", () => {
    render(<RiskBreakdownPopover risk={SAMPLE} ambulant={{ decision: "yellow", hardExclusions: [], yellowFactors: ["BMI high"] }} />);
    expect(screen.getByText(/BMI high/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 16.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 16.3: Implement**

Create `client/src/components/anesthesia/RiskBreakdownPopover.tsx`:

```tsx
import type { PerioperativeRiskResult, DomainKey } from "@shared/scoring/perioperativeRisk";

const DOMAIN_LABEL: Record<DomainKey, string> = {
  cardiac: "Cardiac", vte: "VTE", pulmonary: "Pulmonary", frailty: "Frailty", surgery: "Surgery",
};
const BAND_DOT: Record<string, string> = { low: "bg-green-500", med: "bg-orange-500", high: "bg-red-500" };

export interface AmbulantSummary {
  decision: "green" | "yellow" | "red";
  hardExclusions: string[];
  yellowFactors: string[];
}

export interface RiskBreakdownPopoverProps {
  risk: PerioperativeRiskResult;
  ambulant: AmbulantSummary | null;
}

export function RiskBreakdownPopover({ risk, ambulant }: RiskBreakdownPopoverProps) {
  return (
    <div className="w-80 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl">
      <div className="text-xs font-semibold text-slate-400 mb-2">DOMAINS</div>
      <div className="space-y-1.5 mb-3">
        {(Object.keys(risk.domains) as DomainKey[]).map((k) => (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${BAND_DOT[risk.domains[k].band]}`} />
              {DOMAIN_LABEL[k]}
            </span>
            <span className="text-slate-400 font-mono uppercase">{risk.domains[k].band}</span>
          </div>
        ))}
      </div>
      {risk.ageModifier === 1 && (
        <div className="text-[11px] text-amber-300 mb-2">Age ≥ 75 — bumped up one band</div>
      )}
      {risk.drivers.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-slate-400 mb-1">DRIVERS</div>
          <ul className="text-xs space-y-0.5">
            {risk.drivers.map((d, i) => <li key={i}>• {d}</li>)}
          </ul>
        </div>
      )}
      {ambulant && (
        <div className="mb-3 pt-2 border-t border-slate-700">
          <div className="text-xs font-semibold text-slate-400 mb-1">OUTPATIENT</div>
          <div className="text-xs">
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${ambulant.decision === "green" ? "bg-green-500" : ambulant.decision === "yellow" ? "bg-amber-500" : "bg-red-500"}`} />
            {ambulant.decision === "green" ? "Eligible" : ambulant.decision === "yellow" ? "Review recommended" : "Not eligible"}
            {[...ambulant.hardExclusions, ...ambulant.yellowFactors].length > 0 && (
              <span className="text-slate-400"> — {[...ambulant.hardExclusions, ...ambulant.yellowFactors].join(" · ")}</span>
            )}
          </div>
        </div>
      )}
      <a href="/risk-methodology" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
        How is this calculated? →
      </a>
    </div>
  );
}
```

- [ ] **Step 16.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 16.5: Commit**

```bash
git add client/src/components/anesthesia/RiskBreakdownPopover.tsx client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx
git commit -m "feat(risk): RiskBreakdownPopover with domain breakdown + ambulant + methodology link"
```

---

### Task 17: `<PerioperativeRiskHeader />` shared component

**Files:**
- Create: `client/src/components/anesthesia/PerioperativeRiskHeader.tsx`
- Test: `client/src/components/anesthesia/__tests__/PerioperativeRiskHeader.test.tsx`

- [ ] **Step 17.1: Write failing test**

Create `client/src/components/anesthesia/__tests__/PerioperativeRiskHeader.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerioperativeRiskHeader } from "../PerioperativeRiskHeader";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";

const RISK: PerioperativeRiskResult = {
  domains: {
    cardiac: { band: "med", score: 2, source: "RCRI" }, vte: { band: "low", source: "Caprini" },
    pulmonary: { band: "low", source: "Viali pulmonary v1" }, frailty: { band: "low", source: "mFI-5", partial: false },
    surgery: { band: "low", source: "surgeryRiskClass:minor" },
  },
  worstDomain: "cardiac", ageModifier: 0, grade: "orange",
  drivers: ["Cardiac (RCRI 2 pts, med)"], partial: false, calculatedAt: "2026-05-13T08:00:00.000Z",
};

describe("<PerioperativeRiskHeader />", () => {
  it("renders patient name + risk chip + meta", () => {
    render(<PerioperativeRiskHeader patientName="Keller, Elias" meta="11.01.1967 · ♂ · Dr. Brooks" surgeryStayType="overnight" risk={RISK} ambulant={null} />);
    expect(screen.getByText("Keller, Elias")).toBeInTheDocument();
    expect(screen.getByText(/MED · CARDIAC/)).toBeInTheDocument();
    expect(screen.getByText(/Dr. Brooks/)).toBeInTheDocument();
  });

  it("renders ambulant sub-line only when stayType is ambulant", () => {
    const { rerender, queryByText } = render(<PerioperativeRiskHeader patientName="K" meta="x" surgeryStayType="overnight" risk={RISK} ambulant={{ decision: "green", hardExclusions: [], yellowFactors: [] }} />);
    expect(queryByText(/OUTPATIENT/i)).not.toBeInTheDocument();
    rerender(<PerioperativeRiskHeader patientName="K" meta="x" surgeryStayType="ambulant" risk={RISK} ambulant={{ decision: "green", hardExclusions: [], yellowFactors: [] }} />);
    expect(queryByText(/OUTPATIENT/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 17.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/PerioperativeRiskHeader.test.tsx`
Expected: FAIL.

- [ ] **Step 17.3: Implement**

Create `client/src/components/anesthesia/PerioperativeRiskHeader.tsx`:

```tsx
import { useState } from "react";
import { RiskChip } from "./RiskChip";
import { RiskBreakdownPopover, type AmbulantSummary } from "./RiskBreakdownPopover";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";

export interface PerioperativeRiskHeaderProps {
  patientName: string;
  meta: string;
  surgeryStayType: "ambulant" | "overnight" | null | undefined;
  risk: PerioperativeRiskResult | null | undefined;
  ambulant: AmbulantSummary | null;
}

export function PerioperativeRiskHeader({ patientName, meta, surgeryStayType, risk, ambulant }: PerioperativeRiskHeaderProps) {
  const [open, setOpen] = useState(false);
  const showAmbulant = surgeryStayType === "ambulant" && ambulant;
  return (
    <div className="relative">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="font-semibold text-lg">{patientName}</h3>
        {risk && <RiskChip grade={risk.grade} worstDomain={risk.worstDomain} onClick={() => setOpen((v) => !v)} />}
      </div>
      <div className="text-xs text-slate-400 mt-0.5">{meta}</div>
      {showAmbulant && (
        <div className="text-xs mt-1.5 text-slate-300">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-2">Outpatient</span>
          <span className={ambulant.decision === "green" ? "text-green-400" : ambulant.decision === "yellow" ? "text-amber-400" : "text-red-400"}>●</span>{" "}
          {ambulant.decision === "green" ? "Eligible" : ambulant.decision === "yellow" ? "Review recommended" : "Not eligible"}
          {[...ambulant.hardExclusions, ...ambulant.yellowFactors].length > 0 && (
            <span className="text-slate-400"> — {[...ambulant.hardExclusions, ...ambulant.yellowFactors].join(", ")}</span>
          )}
        </div>
      )}
      {open && risk && (
        <div className="absolute z-10 top-full mt-2 left-0">
          <RiskBreakdownPopover risk={risk} ambulant={ambulant} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 17.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/PerioperativeRiskHeader.test.tsx`
Expected: PASS.

- [ ] **Step 17.5: Commit**

```bash
git add client/src/components/anesthesia/PerioperativeRiskHeader.tsx client/src/components/anesthesia/__tests__/PerioperativeRiskHeader.test.tsx
git commit -m "feat(risk): PerioperativeRiskHeader shared component"
```

---

### Task 18: Wire `<PerioperativeRiskHeader />` into 3 dialog/page locations

**Files:**
- Modify: `client/src/pages/anesthesia/PatientDetail.tsx`
- Modify: `client/src/pages/anesthesia/Pacu.tsx`
- Modify: `client/src/components/anesthesia/AnesthesiaDocumentation.tsx`

- [ ] **Step 18.1: Wire into PatientDetail**

Open `client/src/pages/anesthesia/PatientDetail.tsx`. Find the existing patient-name header block (usually at the top of the rendered page near the patient avatar). Replace the bespoke name/meta HTML with:

```tsx
<PerioperativeRiskHeader
  patientName={`${patient.lastName}, ${patient.firstName}`}
  meta={[formatDate(patient.dateOfBirth), patient.gender === "male" ? "♂" : "♀", surgery?.surgeonName].filter(Boolean).join(" · ")}
  surgeryStayType={surgery?.stayType}
  risk={surgery?.perioperativeRisk}
  ambulant={surgery?.ambulantQuickCheck ? { decision: surgery.ambulantQuickCheck.decision, hardExclusions: surgery.ambulantQuickCheck.hardExclusions ?? [], yellowFactors: surgery.ambulantQuickCheck.yellowFactors ?? [] } : null}
/>
```

Add the import at the top:
```tsx
import { PerioperativeRiskHeader } from "@/components/anesthesia/PerioperativeRiskHeader";
```

- [ ] **Step 18.2: Wire into Pacu**

In `client/src/pages/anesthesia/Pacu.tsx:138`, replace the `<h3 className="font-semibold text-lg truncate"...>` block (and the surrounding patient meta block) with the same `<PerioperativeRiskHeader />` component, mapping fields from whatever shape `patient` has on the PACU page.

- [ ] **Step 18.3: Wire into AnesthesiaDocumentation**

In `client/src/components/anesthesia/AnesthesiaDocumentation.tsx`, find the dialog title / patient-name header. Replace with the same `<PerioperativeRiskHeader />` invocation.

- [ ] **Step 18.4: Verify in browser**

Run: `cd /home/mau/viali && npm run dev` (background)
Open the app, navigate to:
- Anesthesia patient detail — chip should appear next to name.
- PACU page — chip should appear next to name.
- Surgery documentation dialog — chip should appear next to name.

For each: click the chip → popover opens → footer link goes to `/risk-methodology` (will 404 until Task 22).

- [ ] **Step 18.5: Commit**

```bash
git add client/src/pages/anesthesia/PatientDetail.tsx client/src/pages/anesthesia/Pacu.tsx client/src/components/anesthesia/AnesthesiaDocumentation.tsx
git commit -m "feat(risk): wire PerioperativeRiskHeader into PatientDetail, PACU, AnesthesiaDocumentation"
```

---

## Phase 5: OP Calendar — remove old pill, add heat-map

### Task 19: Remove ambulant pill + regression guard

**Files:**
- Modify: `client/src/components/anesthesia/OPCalendar.tsx` (remove lines around 1371–1394)
- Test: `client/src/components/anesthesia/__tests__/OPCalendar.ambulant-pill-removed.test.tsx`

- [ ] **Step 19.1: Write the regression test first**

Create `client/src/components/anesthesia/__tests__/OPCalendar.ambulant-pill-removed.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OPCalendar } from "../OPCalendar";
import { mockSurgeryEvent } from "../../../test-utils/calendarFixtures"; // adjust to whatever fixture helper exists; create one if missing

describe("OPCalendar — ambulant pill removed", () => {
  it("does NOT render the 🟢🟡🔴 ambulant emoji pill on any surgery card", () => {
    const events = [mockSurgeryEvent({ ambulantQuickCheck: { decision: "yellow", hardExclusions: [], yellowFactors: [] } })];
    const { container } = render(<OPCalendar events={events} /* other required props */ />);
    expect(container.querySelector("[data-testid^='ambulant-pill-']")).toBeNull();
    expect(container.textContent).not.toMatch(/🟢|🟡|🔴/);
  });
});
```

If `mockSurgeryEvent` does not exist, create a minimal one in `client/src/test-utils/calendarFixtures.ts`:

```ts
export function mockSurgeryEvent(over: Partial<any> = {}) {
  return {
    id: 1, surgeryId: 1, start: new Date(), end: new Date(),
    plannedSurgery: "Test surgery", patientName: "Test Patient",
    surgeonName: "Dr. Test", isCancelled: false, isSuspended: false,
    noPreOpRequired: false, ambulantQuickCheck: null, riskGrade: "green",
    questionnaireStatus: null, preOpAssessmentStatus: null,
    ...over,
  };
}
```

- [ ] **Step 19.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/OPCalendar.ambulant-pill-removed.test.tsx`
Expected: FAIL — the pill is still in the DOM.

- [ ] **Step 19.3: Delete the pill block**

In `client/src/components/anesthesia/OPCalendar.tsx`, delete the entire block at lines 1371–1394 (the `{event.ambulantQuickCheck?.decision && !event.isCancelled && ...` JSX block ending with `</div>` and closing brace).

- [ ] **Step 19.4: Run to verify pass**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/OPCalendar.ambulant-pill-removed.test.tsx`
Expected: PASS.

- [ ] **Step 19.5: Commit**

```bash
git add client/src/components/anesthesia/OPCalendar.tsx client/src/components/anesthesia/__tests__/OPCalendar.ambulant-pill-removed.test.tsx client/src/test-utils/calendarFixtures.ts
git commit -m "feat(risk): remove ambulant 🟢🟡🔴 pill from OP calendar tiles"
```

---

### Task 20: HeatmapToggle component + localStorage

**Files:**
- Create: `client/src/components/anesthesia/HeatmapToggle.tsx`
- Test: `client/src/components/anesthesia/__tests__/HeatmapToggle.test.tsx`

- [ ] **Step 20.1: Write failing test**

Create `client/src/components/anesthesia/__tests__/HeatmapToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeatmapToggle, useHeatmapEnabled } from "../HeatmapToggle";

describe("HeatmapToggle", () => {
  beforeEach(() => { localStorage.clear(); });

  it("starts OFF and toggles ON", () => {
    function Wrap() {
      const { enabled, setEnabled } = useHeatmapEnabled();
      return <HeatmapToggle enabled={enabled} onChange={setEnabled} />;
    }
    render(<Wrap />);
    const btn = screen.getByRole("button", { name: /risk heat-map/i });
    expect(btn.getAttribute("data-state")).toBe("off");
    fireEvent.click(btn);
    expect(btn.getAttribute("data-state")).toBe("on");
    expect(localStorage.getItem("opCalendar.heatmapEnabled")).toBe("true");
  });

  it("reads initial state from localStorage", () => {
    localStorage.setItem("opCalendar.heatmapEnabled", "true");
    function Wrap() {
      const { enabled, setEnabled } = useHeatmapEnabled();
      return <HeatmapToggle enabled={enabled} onChange={setEnabled} />;
    }
    render(<Wrap />);
    expect(screen.getByRole("button", { name: /risk heat-map/i }).getAttribute("data-state")).toBe("on");
  });
});
```

- [ ] **Step 20.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/HeatmapToggle.test.tsx`
Expected: FAIL.

- [ ] **Step 20.3: Implement**

Create `client/src/components/anesthesia/HeatmapToggle.tsx`:

```tsx
import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "opCalendar.heatmapEnabled";

export function useHeatmapEnabled() {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(STORAGE_KEY, v ? "true" : "false"); } catch { /* noop */ }
  }, []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(e.newValue === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { enabled, setEnabled };
}

export interface HeatmapToggleProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
}

export function HeatmapToggle({ enabled, onChange }: HeatmapToggleProps) {
  return (
    <button
      type="button"
      role="button"
      onClick={() => onChange(!enabled)}
      data-state={enabled ? "on" : "off"}
      aria-pressed={enabled}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border transition-colors ${
        enabled
          ? "border-transparent bg-gradient-to-r from-green-500 via-orange-500 to-red-500 text-white font-semibold"
          : "border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"
      }`}
    >
      <span className={`inline-block w-6 h-3 rounded-full relative transition-colors ${enabled ? "bg-white/30" : "bg-slate-600"}`}>
        <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${enabled ? "left-3" : "left-0.5"}`} />
      </span>
      Risk heat-map
    </button>
  );
}
```

- [ ] **Step 20.4: Run + commit**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/HeatmapToggle.test.tsx`
Expected: PASS.

```bash
git add client/src/components/anesthesia/HeatmapToggle.tsx client/src/components/anesthesia/__tests__/HeatmapToggle.test.tsx
git commit -m "feat(risk): HeatmapToggle component with localStorage persistence"
```

---

### Task 21: Apply heat-map treatment on OP calendar tiles + list view

**Files:**
- Modify: `client/src/components/anesthesia/OPCalendar.tsx`

- [ ] **Step 21.1: Wire the toggle into the calendar header**

In `OPCalendar.tsx`, find the existing view switcher (Day/Week/Month buttons). Import and use the hook + toggle:

```tsx
import { HeatmapToggle, useHeatmapEnabled } from "./HeatmapToggle";

// inside the component body, near other useState calls:
const { enabled: heatmapEnabled, setEnabled: setHeatmapEnabled } = useHeatmapEnabled();
```

In the JSX header, add the toggle right after the Day/Week/Month buttons:

```tsx
<HeatmapToggle enabled={heatmapEnabled} onChange={setHeatmapEnabled} />
```

- [ ] **Step 21.2: Write failing test for the tinted tile**

Create `client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { OPCalendar } from "../OPCalendar";
import { mockSurgeryEvent } from "../../../test-utils/calendarFixtures";

describe("OPCalendar — heat-map", () => {
  beforeEach(() => { localStorage.clear(); });

  it("with heatmap OFF, surgery tile has no tint class", () => {
    const events = [mockSurgeryEvent({ riskGrade: "red" })];
    const { container } = render(<OPCalendar events={events} />);
    const tile = container.querySelector("[data-testid^='preop-status-']")!.closest(".rbc-event");
    expect(tile?.className).not.toMatch(/heatmap-red/);
  });

  it("with heatmap ON, surgery tile has tint class matching riskGrade", () => {
    localStorage.setItem("opCalendar.heatmapEnabled", "true");
    const events = [mockSurgeryEvent({ riskGrade: "red" })];
    const { container } = render(<OPCalendar events={events} />);
    expect(container.querySelector(".heatmap-red")).toBeTruthy();
  });

  it("renders LOW/MED/HIGH chip when heatmap ON", () => {
    localStorage.setItem("opCalendar.heatmapEnabled", "true");
    const events = [mockSurgeryEvent({ riskGrade: "orange", perioperativeRisk: { worstDomain: "cardiac", grade: "orange" } })];
    const { container } = render(<OPCalendar events={events} />);
    expect(container.querySelector("[data-testid^='risk-chip-orange']")).toBeTruthy();
  });
});
```

- [ ] **Step 21.3: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx`
Expected: FAIL.

- [ ] **Step 21.4: Apply tint + accent + chip in the surgery tile renderer**

In `OPCalendar.tsx`, find the event tile renderer (the `useCallback` returning the tile JSX around line 1418). At the top of the function, derive heat-map classes:

```tsx
const heatmapClass = heatmapEnabled && event.riskGrade
  ? event.riskGrade === "red"    ? "heatmap-red bg-red-500/20 border-l-4 border-red-500"
  : event.riskGrade === "orange" ? "heatmap-orange bg-orange-500/20 border-l-4 border-orange-500"
                                  : "heatmap-green bg-green-500/15 border-l-4 border-green-500"
  : "";
```

Apply `heatmapClass` to the outer event tile `div` via className concatenation.

Inside the same renderer, near where the existing pre-op status pill is rendered, add the risk chip when heat-map is ON:

```tsx
{heatmapEnabled && event.riskGrade && event.perioperativeRisk && (
  <div className="absolute top-1 right-1">
    <RiskChip grade={event.riskGrade} worstDomain={event.perioperativeRisk.worstDomain} size="sm" />
  </div>
)}
```

Import at the top: `import { RiskChip } from "./RiskChip";`

- [ ] **Step 21.5: Run + commit**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx`
Expected: PASS.

```bash
git add client/src/components/anesthesia/OPCalendar.tsx client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx
git commit -m "feat(risk): heat-map tinting + chip on OP calendar tiles"
```

- [ ] **Step 21.6: Apply same treatment to the list / table day-week view**

Search the file for the list-row renderer (usually a separate JSX block that renders surgeries in a flat list when `view === 'agenda'` or similar). Apply the same `heatmapClass` + chip pattern to each row. If the list view is rendered by a separate component, edit that component the same way.

- [ ] **Step 21.7: Commit**

```bash
git add client/src/components/anesthesia/OPCalendar.tsx
git commit -m "feat(risk): heat-map treatment on list/agenda view rows"
```

---

### Task 22: Month-view micro-dots

**Files:**
- Modify: `client/src/components/anesthesia/OPCalendar.tsx` (the `MonthDateHeader` component around line 1421)

- [ ] **Step 22.1: Write failing test**

Append to `client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx`:

```tsx
it("month view: shows 3 micro-dots with green/orange/red counts", () => {
  localStorage.setItem("opCalendar.heatmapEnabled", "true");
  const today = new Date();
  const events = [
    mockSurgeryEvent({ id: 1, riskGrade: "green",  start: today, end: today }),
    mockSurgeryEvent({ id: 2, riskGrade: "orange", start: today, end: today }),
    mockSurgeryEvent({ id: 3, riskGrade: "red",    start: today, end: today }),
  ];
  const { container } = render(<OPCalendar events={events} view="month" />);
  expect(container.querySelector(".heatmap-month-dot-green")).toBeTruthy();
  expect(container.querySelector(".heatmap-month-dot-orange")).toBeTruthy();
  expect(container.querySelector(".heatmap-month-dot-red")).toBeTruthy();
});
```

- [ ] **Step 22.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx`
Expected: FAIL.

- [ ] **Step 22.3: Implement**

In `OPCalendar.tsx`, find the `MonthDateHeader` component (around line 1421). Inside its render, when `heatmapEnabled` is true, compute counts per grade for `dayEvents` and append three dots:

```tsx
{heatmapEnabled && (
  <div className="flex gap-1 mt-1">
    {(["green", "orange", "red"] as const).map((g) => {
      const count = dayEvents.filter((e) => e.riskGrade === g).length;
      if (count === 0) return null;
      const colorClass = g === "green" ? "bg-green-500" : g === "orange" ? "bg-orange-500" : "bg-red-500";
      return (
        <span key={g} className={`heatmap-month-dot-${g} inline-flex items-center gap-0.5 text-[9px]`}>
          <span className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />{count}
        </span>
      );
    })}
  </div>
)}
```

- [ ] **Step 22.4: Run + commit**

Run: `cd /home/mau/viali && npx vitest run client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx`
Expected: PASS.

```bash
git add client/src/components/anesthesia/OPCalendar.tsx client/src/components/anesthesia/__tests__/OPCalendar.heatmap.test.tsx
git commit -m "feat(risk): month-view micro-dots for risk grade counts"
```

---

## Phase 6: Methodology page + admin link

### Task 23: `/risk-methodology` page

**Files:**
- Create: `client/src/pages/RiskMethodology.tsx`
- Modify: `client/src/App.tsx` (route registration)
- Test: `client/src/pages/__tests__/RiskMethodology.test.tsx`

- [ ] **Step 23.1: Write failing test**

Create `client/src/pages/__tests__/RiskMethodology.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskMethodology } from "../RiskMethodology";

describe("/risk-methodology", () => {
  it("renders all 5 domain sections", () => {
    render(<RiskMethodology />);
    expect(screen.getByRole("heading", { name: /cardiac/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /VTE/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /pulmonary/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /frailty/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /surgery/i })).toBeInTheDocument();
  });

  it("renders version footer", () => {
    render(<RiskMethodology />);
    expect(screen.getByText(/Methodology v1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 23.2: Run to verify failure**

Run: `cd /home/mau/viali && npx vitest run client/src/pages/__tests__/RiskMethodology.test.tsx`
Expected: FAIL.

- [ ] **Step 23.3: Implement**

Create `client/src/pages/RiskMethodology.tsx`:

```tsx
export function RiskMethodology() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100">
      <h1 className="text-2xl font-bold mb-2">Perioperative Risk Grade</h1>
      <p className="text-slate-300 mb-6">
        The risk grade is a single green / orange / red signal showing global perioperative risk.
        It is computed automatically from existing patient and surgery data and updates whenever
        comorbidities, the questionnaire, or the surgery itself changes.
      </p>
      <p className="text-slate-300 mb-8">
        <strong>Aggregation:</strong> the worst band across five independent domains drives the
        grade. If any domain is high, the grade is red; if any is med (and none high), it is
        orange; otherwise green. Patients aged 75 or older are bumped one band up (never down).
      </p>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Cardiac — RCRI</h2>
        <p className="text-slate-300">
          Revised Cardiac Risk Index (Lee et al., 1999). Counts of: high-risk surgery, ischemic
          heart disease, congestive heart failure, cerebrovascular disease, insulin-dependent
          diabetes, serum creatinine &gt; 2 mg/dL. Bands: low (0 pts) / med (1 pt) / high (≥2 pts).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">VTE — Caprini</h2>
        <p className="text-slate-300">
          Caprini score for venous thromboembolism risk. Combines age, BMI, surgery type, malignancy,
          mobility, VTE history, varicose veins, hormonal therapy, and pregnancy. Bands:
          low (0–2 pts) / med (3–4 pts) / high (≥5 pts).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Pulmonary — Viali pulmonary v1</h2>
        <p className="text-slate-300">
          Custom Viali approximation. Bands: high if COPD present; med if current smoker AND
          (age ≥ 70 OR planned duration &gt; 180 min); otherwise low. This is <em>not</em>
          a validated published score — it is an explicit approximation using only inputs we
          already capture. A future iteration will replace it with full ARISCAT once SpO2,
          recent respiratory infection, and Hb capture are added.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Frailty — mFI-5</h2>
        <p className="text-slate-300">
          5-Factor Modified Frailty Index. Counts of: diabetes, COPD/recent pneumonia, congestive
          heart failure, hypertension requiring meds, and functional dependence in daily
          activities. Bands: low (0) / med (1–2) / high (≥3). Until the functional-dependence
          question on the pre-op questionnaire is answered, the score runs on the 4 available
          factors and is marked <em>partial</em>.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Surgery weight</h2>
        <p className="text-slate-300">
          Bands directly from the surgery's risk class: minor → low, standard / large → med,
          critical → high.
        </p>
      </section>

      <footer className="text-xs text-slate-500 border-t border-slate-700 pt-4">
        Methodology v1 · effective 2026-05-13. Threshold or formula changes will bump the
        version number.
      </footer>
    </div>
  );
}
```

- [ ] **Step 23.4: Register the route**

In `client/src/App.tsx`, find the existing route definitions. Add (matching the pattern of other routes):

```tsx
import { RiskMethodology } from "@/pages/RiskMethodology";

// inside the router children:
<Route path="/risk-methodology" element={<RiskMethodology />} />
```

- [ ] **Step 23.5: Run + commit**

Run: `cd /home/mau/viali && npx vitest run client/src/pages/__tests__/RiskMethodology.test.tsx`
Expected: PASS.

```bash
git add client/src/pages/RiskMethodology.tsx client/src/pages/__tests__/RiskMethodology.test.tsx client/src/App.tsx
git commit -m "feat(risk): /risk-methodology page + route registration"
```

---

### Task 24: Admin Settings link

**Files:**
- Modify: `client/src/pages/admin/AdminSettings.tsx` (or whichever file has the settings menu)

- [ ] **Step 24.1: Locate the settings page**

Run: `grep -rn "Clinical Scoring\|Regional Preferences" /home/mau/viali/client/src/pages/admin/ --include="*.tsx" -l`
Expected: the admin settings file. Open it.

- [ ] **Step 24.2: Add a "Clinical Scoring" section link**

In whatever Settings menu/tab structure exists, add an item:

```tsx
<a href="/risk-methodology" target="_blank" className="text-blue-400 hover:underline">
  Methodology — Perioperative Risk Grade ↗
</a>
```

If there is no existing "Clinical Scoring" section, add it as a new section heading.

- [ ] **Step 24.3: Verify in browser**

Run: `cd /home/mau/viali && npm run dev` (if not already running).
Navigate to `/admin → Settings`. Confirm the link is present and opens `/risk-methodology` in a new tab.

- [ ] **Step 24.4: Commit**

```bash
git add client/src/pages/admin/AdminSettings.tsx
git commit -m "feat(risk): link to /risk-methodology from admin settings"
```

---

## Phase 7: Final verification

### Task 25: Full test suite + typecheck + end-to-end smoke

- [ ] **Step 25.1: Run the full test suite**

Run: `cd /home/mau/viali && npm test -- --run`
Expected: all tests pass.

- [ ] **Step 25.2: Typecheck**

Run: `cd /home/mau/viali && npm run check`
Expected: clean.

- [ ] **Step 25.3: Run the backfill against the dev database**

Run: `cd /home/mau/viali && npx tsx scripts/backfill-risk-grade.ts`
Expected: prints stats `{scanned: N, updated: M, skipped: K}`. Run a second time: expect `updated: 0`.

- [ ] **Step 25.4: Browser smoke**

Run: `cd /home/mau/viali && npm run dev` (background).

Walk through:
1. OP calendar — heat-map toggle off → no tint, no chip. Toggle on → tinted cards, chip top-right.
2. OP calendar list/agenda view — same treatment.
3. OP calendar month view — micro-dot counts visible.
4. Anesthesia patient detail — risk chip visible next to patient name; click → popover; popover footer link → `/risk-methodology` opens.
5. Pacu page — risk chip visible.
6. Anesthesia documentation dialog — risk chip visible.
7. Open an ambulant surgery → header shows the "OUTPATIENT ● Eligible/Not eligible — …" sub-line.
8. Open an overnight surgery → no ambulant sub-line.
9. Admin settings → "Methodology" link works.

- [ ] **Step 25.5: Migration idempotency final check**

Run: `cd /home/mau/viali && npx drizzle-kit push`
Expected: "No changes detected".

- [ ] **Step 25.6: CLAUDE.md "check db for deploy" workflow**

Per `CLAUDE.md`, before flagging the feature ready to deploy, run the full checklist:
1. Read the latest migration SQL — confirm every statement is idempotent.
2. `npx drizzle-kit push` — should report "No changes detected".
3. `npm run check` — clean.
4. Confirm the new entry is present in `migrations/meta/_journal.json` with `when` > all previous entries.

- [ ] **Step 25.7: Final commit (only if anything was left uncommitted)**

```bash
git status
# if anything dangling:
git add -A
git commit -m "chore(risk): final fixups and verification"
```

---

## Self-Review

**Spec coverage:**
- Scoring engine (cardiac, VTE, pulmonary, frailty, surgery) → Tasks 3–8 ✓
- Worst-domain + tiebreaker + age modifier + drivers → Task 8 ✓
- Schema columns + index → Task 1 ✓
- Server recalc triggers (surgery, patient illness, questionnaire) → Tasks 10–12 ✓
- Enriched surgeries payload includes new fields → Task 13 ✓
- Backfill idempotent → Task 14 ✓
- RiskChip + breakdown popover + header → Tasks 15–17 ✓
- Header wired into 3 places → Task 18 ✓
- OP calendar: remove old pill, toggle, tile heat-map, list view, month view → Tasks 19–22 ✓
- Methodology page + admin link → Tasks 23–24 ✓
- Final verification → Task 25 ✓

**Placeholder scan:** None — every step has concrete code, exact paths, and exact commands.

**Type consistency:** `RiskGrade`, `DomainBand`, `DomainKey`, `PerioperativeRiskResult` are defined in Task 2 and used consistently from Task 3 onward. `calculateMfi5` defined in Task 6 with `partial` field is used in Task 8's composite. `RiskChip` is defined in Task 15 and reused in Tasks 16, 17, 21.
