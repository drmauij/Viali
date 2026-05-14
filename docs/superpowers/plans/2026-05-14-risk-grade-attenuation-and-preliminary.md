# Risk Grade — Surgery-Class Attenuation & Preliminary State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop escalating otherwise-MED patients to HIGH purely because of age on minor/standard surgeries, and visibly mark risk grades that were computed before the anesthesia pre-op assessment as Preliminary (dashed border + tilde) — wiring questionnaire conditions into the engine so the Preliminary grade actually reflects the patient's reported comorbidities.

**Architecture:**
- **Algorithm** (`shared/scoring/perioperativeRisk.ts`): suppress the age-≥75 grade bump when `surgeryRiskClass ∈ {minor, standard}`. Add three snapshot fields: `ageEligible`, `ageModifierSuppressed`, `inputSource`. Add `isPreliminary(snapshot)` helper.
- **Server derivation** (`server/scoring/computePerioperativeRisk.ts` + new `projectQuestionnaireConditionsToOrganMaps.ts`): project the flat `questionnaire.conditions` map into per-organ maps using each item's `category` from `hospital.illnessLists`, then merge per-key — assessment wins, questionnaire fills gaps. Set `inputSource` based on which sources have content.
- **UI** (`RiskChip.tsx`, `RiskBreakdownPopover.tsx`, `RiskMethodology.tsx`, call sites): new `preliminary` prop renders dashed border + `· ~` suffix (or `~` prefix on compact tile chip). Popover gains an amber preliminary header line and a slate suppressed-bump line, mutually exclusive with the existing amber bumped-up line. `/risk-methodology` rewritten with a new top section + 4 worked examples.
- **No DB migration** — new fields go in the existing `surgeries.perioperativeRisk` JSONB. Backfill repopulates via the existing `scripts/backfill-risk-grade.ts`.
- **Recompute on questionnaire submit/update** is already wired at `server/routes/questionnaire.ts:605` and `:1667`. Verified, not re-implemented.

**Tech Stack:** TypeScript, Vitest + @testing-library/react for unit/component tests, Drizzle ORM (no migration here), Tailwind CSS, react-i18next.

---

## Pre-flight

- [ ] **Confirm worktree and branch**

```bash
pwd                      # expect: /home/mau/viali/.worktrees/risk-grade-attenuation
git branch --show-current # expect: feat/risk-grade-attenuation
git log --oneline -2     # top: spec(risk): surgery-class attenuation + preliminary state
```

- [ ] **Confirm baseline checks pass on the unchanged tree**

```bash
npm run check
```

Expected: clean TypeScript pass. If anything fails, stop and reconcile before starting.

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts client/src/components/anesthesia/__tests__/RiskChip.test.tsx client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx client/src/pages/__tests__/RiskMethodology.test.tsx --reporter verbose
```

Expected: all green.

---

## Task 1 — Algorithm: snapshot fields + age-bump suppression

**Files:**
- Modify: `shared/scoring/perioperativeRisk.ts:11-21` (interface) and `:138-147` (age-modifier block)
- Test:   `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 1: Add the failing test block at the bottom of `perioperativeRisk.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { calculatePerioperativeRisk, type PerioperativeRiskInputs } from "../perioperativeRisk";

const ZERO_CONCEPTS: PerioperativeRiskInputs["concepts"] = {
  CAD: false, CHF: false, STROKE_HISTORY: false, INSULIN_DIABETES: false,
  CKD_OR_DIALYSIS: false, COPD: false, HYPERTENSION: false, ACTIVE_CANCER: false,
  VTE_HISTORY: false, VARICOSE_VEINS: false, LEG_SWELLING: false,
  FAMILY_THROMBOPHILIA: false, OC_OR_HRT: false, PREGNANCY_OR_POSTPARTUM: false,
  RECENT_STROKE_30D: false, SPINAL_CORD_INJURY: false, KNOWN_UNTREATED_OSAS: false,
  PONV_HISTORY: false,
};

function baseInputs(overrides: Partial<PerioperativeRiskInputs> = {}): PerioperativeRiskInputs {
  return {
    age: 82,
    sex: "f",
    bmi: 25,
    surgeryRiskClass: "minor",
    plannedDurationMinutes: 60,
    isCurrentSmoker: true, // produces Pulmonary MED for age ≥ 70
    functionallyDependent: null,
    metAbove4: null,
    concepts: ZERO_CONCEPTS,
    ...overrides,
  };
}

describe("age modifier × surgery class attenuation", () => {
  it("applies the bump on a large surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "large" }));
    expect(r.ageEligible).toBe(true);
    expect(r.ageModifier).toBe(1);
    expect(r.ageModifierSuppressed).toBe(false);
    expect(r.grade).toBe("red");
  });

  it("applies the bump on a critical surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "critical" }));
    expect(r.ageModifier).toBe(1);
    expect(r.ageModifierSuppressed).toBe(false);
    expect(r.grade).toBe("red");
  });

  it("suppresses the bump on a minor surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "minor" }));
    expect(r.ageEligible).toBe(true);
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(true);
    expect(r.grade).toBe("orange");
  });

  it("suppresses the bump on a standard surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "standard" }));
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(true);
    expect(r.grade).toBe("orange");
  });

  it("below threshold age — no suppression flag, no bump", () => {
    const r = calculatePerioperativeRisk(baseInputs({ age: 70, surgeryRiskClass: "minor" }));
    expect(r.ageEligible).toBe(false);
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(false);
  });

  it("does not mask a high-domain patient on a minor surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({
      age: 70,
      surgeryRiskClass: "minor",
      concepts: { ...ZERO_CONCEPTS, CAD: true, CHF: true, CKD_OR_DIALYSIS: true },
    }));
    expect(r.grade).toBe("red");
    expect(r.worstDomain).toBe("cardiac");
  });

  it("Eva regression: 82 + smoker + minor → ORANGE · VTE", () => {
    const r = calculatePerioperativeRisk(baseInputs({}));
    expect(r.worstDomain).toBe("vte");
    expect(r.grade).toBe("orange");
    expect(r.ageModifierSuppressed).toBe(true);
  });

  it("ageEligible is true whenever age ≥ 75, regardless of suppression", () => {
    const minorR = calculatePerioperativeRisk(baseInputs({ age: 80, surgeryRiskClass: "minor" }));
    const largeR = calculatePerioperativeRisk(baseInputs({ age: 80, surgeryRiskClass: "large" }));
    expect(minorR.ageEligible).toBe(true);
    expect(largeR.ageEligible).toBe(true);
  });

  it("ageModifier === 1 and ageModifierSuppressed are mutually exclusive", () => {
    for (const sc of ["minor", "standard", "large", "critical"] as const) {
      for (const age of [50, 75, 90]) {
        const r = calculatePerioperativeRisk(baseInputs({ age, surgeryRiskClass: sc }));
        expect(r.ageModifier === 1 && r.ageModifierSuppressed).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run the new tests, confirm they fail (or fail to compile due to missing fields)**

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts -t "age modifier × surgery class attenuation"
```

Expected: failures on `r.ageEligible`, `r.ageModifierSuppressed` (fields don't exist), and the `surgeryRiskClass: "minor"` case (grade still red).

- [ ] **Step 3: Extend the snapshot type in `shared/scoring/perioperativeRisk.ts:11-21`**

```ts
export interface PerioperativeRiskResult {
  domains: Record<DomainKey, DomainResult>;
  worstDomain: DomainKey;
  ageModifier: 0 | 1;
  ageEligible: boolean;
  ageModifierSuppressed: boolean;
  grade: RiskGrade;
  drivers: string[];
  partial: boolean;
  inputSource: "assessment" | "questionnaire" | "default";
  calculatedAt: string;
}
```

- [ ] **Step 4: Replace the age-modifier block in `shared/scoring/perioperativeRisk.ts:137-147`**

Locate this block (it currently reads):

```ts
  // Aggregate grade.
  let grade: RiskGrade = topRank === 2 ? "red" : topRank === 1 ? "orange" : "green";

  // Age modifier — never bumps down, caps at red.
  const ageModifier: 0 | 1 = i.age >= 75 ? 1 : 0;
  if (ageModifier === 1) {
    if (grade === "green") grade = "orange";
    else if (grade === "orange") grade = "red";
  }
```

Replace with:

```ts
  // Aggregate grade.
  let grade: RiskGrade = topRank === 2 ? "red" : topRank === 1 ? "orange" : "green";

  // Age modifier — never bumps down, caps at red.
  // Suppressed for minor/standard surgeries: a low-risk procedure does not
  // amplify age-driven baseline risk. See spec
  // docs/superpowers/specs/2026-05-14-risk-grade-attenuation-and-preliminary-design.md.
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

- [ ] **Step 5: Update the return object in `shared/scoring/perioperativeRisk.ts` (the block after `drivers`)**

Locate the existing return:

```ts
  return {
    domains,
    worstDomain,
    ageModifier,
    grade,
    drivers,
    partial: Object.values(domains).some((d) => d.partial === true),
    calculatedAt: new Date().toISOString(),
  };
```

Replace with:

```ts
  return {
    domains,
    worstDomain,
    ageModifier,
    ageEligible,
    ageModifierSuppressed,
    grade,
    drivers,
    // `partial` is set upstream by computeRiskSnapshot when no assessment exists.
    // Optional input absences (metAbove4, functionallyDependent) don't make the
    // computed grade unreliable.
    partial: Object.values(domains).some((d) => d.partial === true),
    // Defaulted here; computeRiskSnapshot sets the real value upstream.
    inputSource: "assessment",
    calculatedAt: new Date().toISOString(),
  };
```

- [ ] **Step 6: Run the new tests, confirm they pass**

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts -t "age modifier × surgery class attenuation"
```

Expected: all 9 assertions green.

- [ ] **Step 7: Run the full existing test file, confirm no regressions**

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts
```

Expected: all previously-green tests still green.

- [ ] **Step 8: TypeScript check**

```bash
npm run check
```

Expected: clean.

> **Note:** new `inputSource` and `ageEligible`/`ageModifierSuppressed` fields may flag TypeScript errors at callers reading the snapshot. Address them only if `npm run check` complains; otherwise leave for Task 4.

- [ ] **Step 9: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "$(cat <<'EOF'
feat(risk): suppress age bump on minor/standard surgery

Adds three snapshot fields:
- ageEligible: did age >= 75 trigger?
- ageModifierSuppressed: was a bump suppressed by surgery class?
- inputSource: defaults to "assessment", set upstream

Algorithm: when ageEligible && surgeryRiskClass in {minor, standard},
ageModifier stays 0 and ageModifierSuppressed flips true. ageModifier
and ageModifierSuppressed are mutually exclusive.

Resolves the "healthy 82yo for outpatient hernia -> HIGH" overkill.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `isPreliminary` snapshot helper

**Files:**
- Modify: `shared/scoring/perioperativeRisk.ts` (append at end)
- Test:   `shared/scoring/__tests__/perioperativeRisk.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `shared/scoring/__tests__/perioperativeRisk.test.ts`:

```ts
import { isPreliminary } from "../perioperativeRisk";

describe("isPreliminary helper", () => {
  it("returns false when inputSource is 'assessment'", () => {
    expect(isPreliminary({ inputSource: "assessment", partial: false } as any)).toBe(false);
  });

  it("returns true when inputSource is 'questionnaire'", () => {
    expect(isPreliminary({ inputSource: "questionnaire", partial: true } as any)).toBe(true);
  });

  it("returns true when inputSource is 'default'", () => {
    expect(isPreliminary({ inputSource: "default", partial: true } as any)).toBe(true);
  });

  it("backwards-compat: falls back to partial when inputSource is missing", () => {
    expect(isPreliminary({ partial: true } as any)).toBe(true);
    expect(isPreliminary({ partial: false } as any)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isPreliminary(null)).toBe(false);
    expect(isPreliminary(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm the tests fail (import not resolved)**

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts -t "isPreliminary helper"
```

Expected: failure on `import { isPreliminary }`.

- [ ] **Step 3: Append the helper at the bottom of `shared/scoring/perioperativeRisk.ts`**

```ts
/**
 * Returns true when the snapshot was computed without an anesthesia pre-op
 * assessment. Backwards-compat: pre-backfill snapshots may lack `inputSource`;
 * they fall back to the legacy `partial` flag.
 */
export function isPreliminary(
  snapshot: PerioperativeRiskResult | null | undefined,
): boolean {
  if (!snapshot) return false;
  if (snapshot.inputSource) return snapshot.inputSource !== "assessment";
  return snapshot.partial === true;
}
```

- [ ] **Step 4: Run the tests, confirm green**

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts -t "isPreliminary helper"
```

Expected: 5/5 green.

- [ ] **Step 5: Run the full file again, confirm no regressions**

```bash
npx vitest run shared/scoring/__tests__/perioperativeRisk.test.ts
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add shared/scoring/perioperativeRisk.ts shared/scoring/__tests__/perioperativeRisk.test.ts
git commit -m "feat(risk): add isPreliminary snapshot helper

Centralizes the 'no assessment yet' check used by both RiskChip and
RiskBreakdownPopover. Backwards-compat: falls back to legacy partial
when inputSource is absent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Questionnaire → organ-map projection helper

**Files:**
- Create: `server/scoring/projectQuestionnaireConditionsToOrganMaps.ts`
- Create: `server/scoring/__tests__/projectQuestionnaireConditionsToOrganMaps.test.ts`

- [ ] **Step 1: Create the test file with failing tests**

Create `server/scoring/__tests__/projectQuestionnaireConditionsToOrganMaps.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectQuestionnaireConditionsToOrganMaps } from "../projectQuestionnaireConditionsToOrganMaps";

const lists = {
  cardiovascular: [
    { id: "cad", label: "CAD" },
    { id: "htn", label: "Hypertension" },
  ],
  pulmonary: [
    { id: "copd", label: "COPD" },
  ],
  coagulation: [
    { id: "vte_h", label: "VTE history" },
  ],
};

describe("projectQuestionnaireConditionsToOrganMaps", () => {
  it("returns empty maps for null/undefined conditions", () => {
    expect(projectQuestionnaireConditionsToOrganMaps(null, lists)).toEqual({});
    expect(projectQuestionnaireConditionsToOrganMaps(undefined, lists)).toEqual({});
  });

  it("returns empty maps when conditions is empty", () => {
    expect(projectQuestionnaireConditionsToOrganMaps({}, lists)).toEqual({});
  });

  it("maps a single checked cardiovascular item into the cardiovascular bucket", () => {
    const r = projectQuestionnaireConditionsToOrganMaps(
      { cad: { checked: true } },
      lists,
    );
    expect(r.cardiovascular).toEqual({ cad: true });
  });

  it("maps unchecked entries as false (not absent)", () => {
    const r = projectQuestionnaireConditionsToOrganMaps(
      { cad: { checked: false } },
      lists,
    );
    expect(r.cardiovascular).toEqual({ cad: false });
  });

  it("splits items into per-category buckets", () => {
    const r = projectQuestionnaireConditionsToOrganMaps(
      {
        cad:    { checked: true },
        htn:    { checked: true },
        copd:   { checked: true },
        vte_h:  { checked: false },
      },
      lists,
    );
    expect(r.cardiovascular).toEqual({ cad: true, htn: true });
    expect(r.pulmonary).toEqual({ copd: true });
    expect(r.coagulation).toEqual({ vte_h: false });
  });

  it("skips items whose id is not in any list", () => {
    const r = projectQuestionnaireConditionsToOrganMaps(
      { unknown_id: { checked: true } },
      lists,
    );
    expect(r).toEqual({});
  });

  it("tolerates a null or undefined illnessLists argument", () => {
    expect(projectQuestionnaireConditionsToOrganMaps({ cad: { checked: true } }, null)).toEqual({});
    expect(projectQuestionnaireConditionsToOrganMaps({ cad: { checked: true } }, undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail (import not resolved)**

```bash
npx vitest run server/scoring/__tests__/projectQuestionnaireConditionsToOrganMaps.test.ts
```

Expected: failure on `import { projectQuestionnaireConditionsToOrganMaps }`.

- [ ] **Step 3: Create `server/scoring/projectQuestionnaireConditionsToOrganMaps.ts`**

```ts
type ConditionEntry = { checked?: boolean; notes?: string };
type Conditions = Record<string, ConditionEntry>;
type ItemList = Array<{ id: string }>;
type IllnessLists = Record<string, ItemList>;
type OrganMaps = Record<string, Record<string, boolean>>;

/**
 * Project the flat `questionnaire.conditions` map into per-organ maps that
 * match the assessment's organ-system shape (heartIllnesses, lungIllnesses,
 * …). Each item is routed by which category list in `hospital.illnessLists`
 * contains its id. Items not found in any list are skipped (defensive — the
 * questionnaire UI sometimes carries legacy ids).
 */
export function projectQuestionnaireConditionsToOrganMaps(
  conditions: Conditions | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): OrganMaps {
  if (!conditions || !illnessLists) return {};

  const idToCategory = new Map<string, string>();
  for (const [category, items] of Object.entries(illnessLists)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item && typeof item.id === "string") {
        idToCategory.set(item.id, category);
      }
    }
  }

  const result: OrganMaps = {};
  for (const [itemId, entry] of Object.entries(conditions)) {
    const category = idToCategory.get(itemId);
    if (!category) continue; // unknown id — defensive skip
    if (!result[category]) result[category] = {};
    result[category][itemId] = entry?.checked === true;
  }
  return result;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run server/scoring/__tests__/projectQuestionnaireConditionsToOrganMaps.test.ts
```

Expected: 7/7 green.

- [ ] **Step 5: TypeScript check**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add server/scoring/projectQuestionnaireConditionsToOrganMaps.ts server/scoring/__tests__/projectQuestionnaireConditionsToOrganMaps.test.ts
git commit -m "feat(risk): helper to project questionnaire conditions to organ maps

Maps the flat questionnaire.conditions map into the per-organ
(cardiovascular, pulmonary, coagulation, ...) shape that the
assessment's organ-system maps already use. Routes each item by
its category in hospital.illnessLists. Unknown ids are skipped
defensively.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Server derivation: per-key fall-through + `inputSource`

**Files:**
- Modify: `server/scoring/computePerioperativeRisk.ts` (the `deriveRiskInputsFromRecords` function and `computeRiskSnapshot`)
- Create: `server/scoring/__tests__/computePerioperativeRisk.test.ts`

- [ ] **Step 1: Create the test file with failing tests**

Create `server/scoring/__tests__/computePerioperativeRisk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveRiskInputsFromRecords, computeRiskSnapshot } from "../computePerioperativeRisk";

const ILLNESS_LISTS = {
  cardiovascular: [
    { id: "cad", label: "CAD", scoringConcept: "CAD" },
    { id: "htn", label: "Hypertension", scoringConcept: "HYPERTENSION" },
  ],
  pulmonary: [
    { id: "copd", label: "COPD", scoringConcept: "COPD" },
  ],
  coagulation: [
    { id: "vte_h", label: "VTE history", scoringConcept: "VTE_HISTORY" },
  ],
};

const PATIENT = { birthday: "1943-12-13", sex: "F" };
const SURGERY = { surgeryRiskClass: "minor", plannedDate: null, actualEndTime: null };

describe("deriveRiskInputsFromRecords", () => {
  it("inputSource is 'default' when nothing is filled", () => {
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, null, ILLNESS_LISTS);
    expect(r.inputSource).toBe("default");
    expect(r.partial).toBe(true);
    expect(r.inputs.concepts.CAD).toBe(false);
  });

  it("inputSource is 'questionnaire' when questionnaire conditions are present", () => {
    const questionnaire = {
      conditions: { cad: { checked: true } },
    };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, questionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("questionnaire");
    expect(r.partial).toBe(true);
    expect(r.inputs.concepts.CAD).toBe(true);
  });

  it("inputSource is 'assessment' when assessment has organ-system data", () => {
    const assessment = { heartIllnesses: { cad: true } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, null, ILLNESS_LISTS);
    expect(r.inputSource).toBe("assessment");
    expect(r.partial).toBe(false);
    expect(r.inputs.concepts.CAD).toBe(true);
  });

  it("empty assessment row falls through to questionnaire", () => {
    const assessment = { heartIllnesses: {}, lungIllnesses: {} };
    const questionnaire = { conditions: { copd: { checked: true } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, questionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("questionnaire");
    expect(r.inputs.concepts.COPD).toBe(true);
  });

  it("per-key fall-through: half-filled assessment keeps questionnaire lung data", () => {
    const assessment = { heartIllnesses: { cad: true } }; // no lungIllnesses
    const questionnaire = { conditions: { copd: { checked: true } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, questionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("assessment"); // assessment has data
    expect(r.inputs.concepts.CAD).toBe(true);
    expect(r.inputs.concepts.COPD).toBe(true); // from questionnaire fall-through
  });

  it("assessment override wins over questionnaire for the same key", () => {
    const assessment = { heartIllnesses: { cad: false } };
    const questionnaire = { conditions: { cad: { checked: true } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, questionnaire, ILLNESS_LISTS);
    expect(r.inputs.concepts.CAD).toBe(false);
  });

  it("BMI: assessment wins, questionnaire fills gap", () => {
    const aOnly = { weight: 80, height: 175 };
    const qOnly = { height: 160, weight: 60 };
    const both  = { ...aOnly };
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, aOnly, null, ILLNESS_LISTS).inputs.bmi).toBeCloseTo(80 / 1.75 ** 2, 1);
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, null, qOnly, ILLNESS_LISTS).inputs.bmi).toBeCloseTo(60 / 1.6 ** 2, 1);
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, both, qOnly, ILLNESS_LISTS).inputs.bmi).toBeCloseTo(80 / 1.75 ** 2, 1);
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, null, null, ILLNESS_LISTS).inputs.bmi).toBeNull();
  });
});

describe("computeRiskSnapshot Eva regression", () => {
  it("82F smoker, no comorbidities, minor surgery, questionnaire only → ORANGE · VTE · Preliminary", () => {
    const questionnaire = { smokingStatus: "current", conditions: {} };
    const snap = computeRiskSnapshot(PATIENT, SURGERY, null, questionnaire, ILLNESS_LISTS);
    expect(snap.grade).toBe("orange");
    expect(snap.worstDomain).toBe("vte");
    expect(snap.ageModifierSuppressed).toBe(true);
    expect(snap.ageEligible).toBe(true);
    expect(snap.inputSource).toBe("questionnaire");
    expect(snap.partial).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run server/scoring/__tests__/computePerioperativeRisk.test.ts
```

Expected: failures on `r.inputSource`, on per-key fall-through (no questionnaire wiring yet), and on the Eva snapshot's `inputSource`.

- [ ] **Step 3: Update `bmiFromAssessment` and add a `bmiFromQuestionnaire` mirror in `server/scoring/computePerioperativeRisk.ts`**

After the existing `bmiFromAssessment` function, add:

```ts
function bmiFromQuestionnaire(questionnaire: AnyRec | null | undefined): number | null {
  if (!questionnaire) return null;
  const wRaw = questionnaire.weight;
  const hRaw = questionnaire.height;
  const w = wRaw ? Number(wRaw) : null;
  const h = hRaw ? Number(hRaw) : null;
  if (!w || !h) return null;
  const meters = h > 3 ? h / 100 : h;
  if (!meters) return null;
  return w / (meters * meters);
}
```

- [ ] **Step 4: Update `RiskInputBundle` and `deriveRiskInputsFromRecords` to return `inputSource`**

Find the existing:

```ts
export interface RiskInputBundle {
  inputs: PerioperativeRiskInputs;
  partial: boolean;
}
```

Replace with:

```ts
export interface RiskInputBundle {
  inputs: PerioperativeRiskInputs;
  partial: boolean;
  inputSource: "assessment" | "questionnaire" | "default";
}
```

- [ ] **Step 5: Rewrite the body of `deriveRiskInputsFromRecords`**

Add this import at the top of `server/scoring/computePerioperativeRisk.ts`:

```ts
import { projectQuestionnaireConditionsToOrganMaps } from "./projectQuestionnaireConditionsToOrganMaps";
```

Find and replace the function. The new full body is:

```ts
export function deriveRiskInputsFromRecords(
  patient: AnyRec | null | undefined,
  surgery: AnyRec,
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): RiskInputBundle {
  const lists = (illnessLists ?? {}) as IllnessLists;
  const cardio = lists.cardiovascular ?? [];
  const pulm = lists.pulmonary ?? [];
  const coag = lists.coagulation ?? [];
  const neuro = lists.neurological ?? [];
  const metab = lists.metabolic ?? [];
  const infect = lists.infectious ?? [];
  const woman = lists.woman ?? [];
  const ponv = lists.ponvTransfusion ?? [];

  // Assessment organ-system maps (existing).
  const a = {
    cardiovascular: (assessment?.heartIllnesses ?? {}) as Record<string, boolean>,
    pulmonary:      (assessment?.lungIllnesses ?? {}) as Record<string, boolean>,
    coagulation:    (assessment?.coagulationIllnesses ?? {}) as Record<string, boolean>,
    neurological:   (assessment?.neuroIllnesses ?? {}) as Record<string, boolean>,
    metabolic:      (assessment?.metabolicIllnesses ?? {}) as Record<string, boolean>,
    infectious:     (assessment?.infectiousIllnesses ?? {}) as Record<string, boolean>,
    woman:          (assessment?.womanIssues ?? {}) as Record<string, boolean>,
    ponvTransfusion: (assessment?.ponvTransfusionIssues ?? {}) as Record<string, boolean>,
  };

  // NEW: questionnaire conditions → per-organ shape.
  const q = projectQuestionnaireConditionsToOrganMaps(
    questionnaire?.conditions as Record<string, { checked?: boolean }> | undefined,
    lists as Record<string, ItemList>,
  );

  // Per-key fall-through: assessment overrides, questionnaire fills gaps.
  function merged(category: keyof typeof a): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    const fromQ = q[category] ?? {};
    for (const [k, v] of Object.entries(fromQ)) result[k] = v;
    for (const [k, v] of Object.entries(a[category])) result[k] = v; // assessment overrides
    return result;
  }

  const heart   = merged("cardiovascular");
  const lung    = merged("pulmonary");
  const coagD   = merged("coagulation");
  const neuroD  = merged("neurological");
  const metabD  = merged("metabolic");
  const infectD = merged("infectious");
  const womanD  = merged("woman");
  const ponvD   = merged("ponvTransfusion");

  // inputSource resolution.
  const anyAssessmentData = Object.values(a).some((m) => Object.keys(m).length > 0);
  const anyQuestionnaireData =
    !!questionnaire &&
    (Object.keys(q).length > 0 ||
      questionnaire.smokingStatus ||
      typeof questionnaire.functionallyDependent === "boolean" ||
      typeof questionnaire.metAbove4 === "boolean" ||
      questionnaire.weight ||
      questionnaire.height);
  const inputSource: "assessment" | "questionnaire" | "default" = anyAssessmentData
    ? "assessment"
    : anyQuestionnaireData
      ? "questionnaire"
      : "default";

  const find = (
    data: Record<string, boolean>,
    list: ItemList,
    concept: ScoringConcept,
  ): boolean => findConcept(data, list, concept);

  const inputs: PerioperativeRiskInputs = {
    age: ageFromPatient(patient),
    sex: sexFromPatient(patient),
    bmi: bmiFromAssessment(assessment) ?? bmiFromQuestionnaire(questionnaire),
    surgeryRiskClass: (surgery.surgeryRiskClass ?? "minor") as SurgeryRiskClass,
    plannedDurationMinutes: plannedMinutesFromSurgery(surgery),
    isCurrentSmoker: isCurrentSmokerFromSources(assessment, questionnaire),
    functionallyDependent: typeof assessment?.functionallyDependent === "boolean"
      ? assessment.functionallyDependent
      : typeof questionnaire?.functionallyDependent === "boolean"
        ? questionnaire.functionallyDependent
        : null,
    metAbove4: typeof assessment?.metAbove4 === "boolean"
      ? assessment.metAbove4
      : typeof questionnaire?.metAbove4 === "boolean"
        ? questionnaire.metAbove4
        : null,
    concepts: {
      CAD: find(heart, cardio, "CAD"),
      CHF: find(heart, cardio, "CHF"),
      STROKE_HISTORY: find(neuroD, neuro, "STROKE_HISTORY"),
      INSULIN_DIABETES: find(metabD, metab, "INSULIN_DIABETES"),
      CKD_OR_DIALYSIS: find(metabD, metab, "CKD_OR_DIALYSIS"),
      COPD: find(lung, pulm, "COPD"),
      HYPERTENSION: find(heart, cardio, "HYPERTENSION"),
      ACTIVE_CANCER: find(infectD, infect, "ACTIVE_CANCER"),
      VTE_HISTORY: find(coagD, coag, "VTE_HISTORY"),
      VARICOSE_VEINS: find(coagD, coag, "VARICOSE_VEINS"),
      LEG_SWELLING: find(coagD, coag, "LEG_SWELLING"),
      FAMILY_THROMBOPHILIA: find(coagD, coag, "FAMILY_THROMBOPHILIA"),
      OC_OR_HRT: find(womanD, woman, "OC_OR_HRT"),
      PREGNANCY_OR_POSTPARTUM: find(womanD, woman, "PREGNANCY_OR_POSTPARTUM"),
      RECENT_STROKE_30D: find(neuroD, neuro, "RECENT_STROKE_30D"),
      SPINAL_CORD_INJURY: find(neuroD, neuro, "SPINAL_CORD_INJURY"),
      KNOWN_UNTREATED_OSAS: find(lung, pulm, "KNOWN_UNTREATED_OSAS"),
      PONV_HISTORY: find(ponvD, ponv, "PONV_HISTORY"),
    },
  };

  return { inputs, partial: inputSource !== "assessment", inputSource };
}
```

- [ ] **Step 6: Update `computeRiskSnapshot` to propagate `inputSource`**

Find the existing:

```ts
export function computeRiskSnapshot(
  patient: AnyRec | null | undefined,
  surgery: AnyRec,
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): PerioperativeRiskResult {
  const { inputs, partial } = deriveRiskInputsFromRecords(
    patient,
    surgery,
    assessment,
    questionnaire,
    illnessLists,
  );
  const result = calculatePerioperativeRisk(inputs);
  if (partial) {
    return { ...result, partial: true };
  }
  return result;
}
```

Replace with:

```ts
export function computeRiskSnapshot(
  patient: AnyRec | null | undefined,
  surgery: AnyRec,
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): PerioperativeRiskResult {
  const { inputs, partial, inputSource } = deriveRiskInputsFromRecords(
    patient,
    surgery,
    assessment,
    questionnaire,
    illnessLists,
  );
  const result = calculatePerioperativeRisk(inputs);
  return { ...result, partial, inputSource };
}
```

- [ ] **Step 7: Run the new derivation tests, confirm they pass**

```bash
npx vitest run server/scoring/__tests__/computePerioperativeRisk.test.ts
```

Expected: 8/8 green.

- [ ] **Step 8: Run the full scoring test suite, confirm no regressions**

```bash
npx vitest run shared/scoring server/scoring
```

Expected: all green.

- [ ] **Step 9: TypeScript check**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add server/scoring/computePerioperativeRisk.ts server/scoring/__tests__/computePerioperativeRisk.test.ts
git commit -m "$(cat <<'EOF'
feat(risk): wire questionnaire conditions into score derivation

deriveRiskInputsFromRecords now projects questionnaire.conditions into
per-organ maps and merges per-key with the assessment's organ-system
maps. Assessment overrides; questionnaire fills gaps. BMI gets a
questionnaire fallback. The new inputSource field on the snapshot
distinguishes assessment / questionnaire / default — used downstream to
render the Preliminary badge.

Resolves the "questionnaire submitted but all comorbidities read as
false" gap. Empty assessment rows fall through to questionnaire.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — `RiskChip` preliminary prop

**Files:**
- Modify: `client/src/components/anesthesia/RiskChip.tsx`
- Modify: `client/src/components/anesthesia/__tests__/RiskChip.test.tsx`

- [ ] **Step 1: Append failing tests to `RiskChip.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskChip } from "../RiskChip";

describe("RiskChip preliminary state", () => {
  it("preliminary=false renders solid border and no tilde suffix", () => {
    render(<RiskChip grade="orange" worstDomain="vte" preliminary={false} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.className).not.toContain("border-dashed");
    expect(chip.textContent).not.toContain("~");
  });

  it("preliminary=true renders dashed border and ' · ~' suffix", () => {
    render(<RiskChip grade="orange" worstDomain="vte" preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.className).toContain("border-dashed");
    expect(chip.textContent).toContain("~");
  });

  it("preliminary=true sets aria-label to the preliminary tooltip", () => {
    render(<RiskChip grade="orange" worstDomain="vte" preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.getAttribute("aria-label")).toMatch(/preliminary/i);
  });

  it("compact + preliminary renders dashed wrapper and leading tilde", () => {
    render(<RiskChip grade="orange" compact={true} preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-orange");
    expect(chip.className).toContain("border-dashed");
    expect(chip.textContent?.trim().startsWith("~")).toBe(true);
  });

  it("insufficient overrides preliminary — NOT DEFINED has no marker", () => {
    render(<RiskChip compact={true} insufficient={true} preliminary={true} />);
    const chip = screen.getByTestId("risk-chip-unknown");
    expect(chip.className).not.toContain("border-dashed");
    expect(chip.textContent).toBe("NOT DEFINED");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run client/src/components/anesthesia/__tests__/RiskChip.test.tsx -t "preliminary state"
```

Expected: failures on `preliminary` prop not recognized + missing dashed class.

- [ ] **Step 3: Update `client/src/components/anesthesia/RiskChip.tsx`**

Replace the entire file with:

```tsx
import { useTranslation } from "react-i18next";
import type { RiskGrade, DomainKey } from "@shared/scoring/perioperativeRisk";

const GRADE_LABEL: Record<RiskGrade, string> = { green: "LOW", orange: "MED", red: "HIGH" };
const GRADE_LABEL_FULL: Record<RiskGrade, string> = { green: "LOW", orange: "MEDIUM", red: "HIGH" };
const GRADE_CLASS: Record<RiskGrade, string> = {
  green:  "bg-green-500/20 text-green-300 border-green-500/30",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  red:    "bg-red-500/25 text-red-200 border-red-500/40",
};
const DOT_CLASS: Record<RiskGrade, string> = { green: "bg-green-500", orange: "bg-orange-500", red: "bg-red-500" };

export interface RiskChipProps {
  grade?: RiskGrade | null;
  worstDomain?: DomainKey;
  onClick?: () => void;
  size?: "sm" | "md";
  /** Calendar-tile mode: tile background conveys grade, so the chip is a
   *  compact pill showing the explicit grade label (LOW / MEDIUM / HIGH /
   *  NOT DEFINED). Use insufficient=true to render the gray NOT DEFINED state. */
  compact?: boolean;
  /** When true (or when grade is missing), the chip renders NOT DEFINED. */
  insufficient?: boolean;
  /** When true, the snapshot was computed without an anesthesia pre-op
   *  assessment. The chip renders with a dashed border and a tilde marker. */
  preliminary?: boolean;
}

export function RiskChip({
  grade,
  worstDomain,
  onClick,
  size = "md",
  compact = false,
  insufficient = false,
  preliminary = false,
}: RiskChipProps) {
  const { t } = useTranslation();

  if (compact) {
    const unknown = insufficient || !grade;
    // Preliminary marker doesn't apply to NOT DEFINED — different state.
    const showPreliminary = preliminary && !unknown;
    const baseClass = "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tracking-wide bg-black/35 text-white whitespace-nowrap shrink-0";
    const borderClass = showPreliminary ? "border border-dashed border-white/60" : "";
    const ariaLabel = showPreliminary ? t("chip.preliminaryTooltip") : undefined;
    return (
      <span
        className={`${baseClass} ${borderClass}`}
        data-testid={`risk-chip-${unknown ? "unknown" : grade}`}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {unknown ? "NOT DEFINED" : `${showPreliminary ? "~" : ""}${GRADE_LABEL_FULL[grade!]}`}
      </span>
    );
  }

  // Full chip — used in headers + popovers. Requires grade + worstDomain.
  if (!grade || !worstDomain) return null;
  const text = `${GRADE_LABEL[grade]} · ${worstDomain.toUpperCase()}${preliminary ? " · ~" : ""}`;
  const sizeClass = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  const borderStyle = preliminary ? "border-dashed" : "";
  const ariaLabel = preliminary ? t("chip.preliminaryTooltip") : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tracking-wide ${sizeClass} ${GRADE_CLASS[grade]} ${borderStyle} ${onClick ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
      data-testid={`risk-chip-${grade}`}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[grade]}`} />
      {text}
    </button>
  );
}
```

- [ ] **Step 4: Run the new tests, confirm they pass**

```bash
npx vitest run client/src/components/anesthesia/__tests__/RiskChip.test.tsx -t "preliminary state"
```

Expected: 5/5 green.

- [ ] **Step 5: Run the full RiskChip test file, confirm no regressions**

```bash
npx vitest run client/src/components/anesthesia/__tests__/RiskChip.test.tsx
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/RiskChip.tsx client/src/components/anesthesia/__tests__/RiskChip.test.tsx
git commit -m "$(cat <<'EOF'
feat(risk): preliminary state on RiskChip

Adds the `preliminary` prop. When true:
- full chip: dashed border + ' . ~' suffix after the worst-domain label
- compact tile chip: dashed wrapper + leading '~' before MEDIUM/etc.
- aria-label/title: 'chip.preliminaryTooltip' i18n key

NOT DEFINED is unaffected — different state, different visual.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — `RiskBreakdownPopover` preliminary header + suppressed-bump line

**Files:**
- Modify: `client/src/components/anesthesia/RiskBreakdownPopover.tsx`
- Modify: `client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx`

- [ ] **Step 1: Append failing tests to `RiskBreakdownPopover.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskBreakdownPopover } from "../RiskBreakdownPopover";
import type { PerioperativeRiskResult } from "@shared/scoring/perioperativeRisk";

function baseRisk(overrides: Partial<PerioperativeRiskResult> = {}): PerioperativeRiskResult {
  return {
    domains: {
      cardiac:   { band: "low", source: "RCRI 0 pt" },
      vte:       { band: "med", source: "Caprini" },
      pulmonary: { band: "med", source: "smoker + age" },
      frailty:   { band: "low", source: "mFI-5 = 0" },
      surgery:   { band: "low", source: "surgeryRiskClass:minor" },
    },
    worstDomain: "vte",
    ageModifier: 0,
    ageEligible: true,
    ageModifierSuppressed: true,
    grade: "orange",
    drivers: ["VTE (Caprini 3, med)", "Pulmonary (med)"],
    partial: false,
    inputSource: "assessment",
    calculatedAt: "2026-05-14T00:00:00Z",
    ...overrides,
  };
}

describe("RiskBreakdownPopover preliminary + suppressed-bump", () => {
  it("renders the preliminary header when inputSource is 'questionnaire'", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ inputSource: "questionnaire", partial: true })} ambulant={null} />);
    expect(screen.getByText(/preliminary/i)).toBeTruthy();
  });

  it("does NOT render the preliminary header when inputSource is 'assessment'", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ inputSource: "assessment" })} ambulant={null} />);
    expect(screen.queryByText(/preliminary/i)).toBeNull();
  });

  it("renders the suppressed-bump line when ageModifierSuppressed is true", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ ageModifierSuppressed: true, ageModifier: 0 })} ambulant={null} />);
    expect(screen.getByText(/suppressed/i)).toBeTruthy();
  });

  it("renders the existing 'bumped up' line when ageModifier === 1", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ ageModifier: 1, ageModifierSuppressed: false })} ambulant={null} />);
    expect(screen.getByText(/bumped/i)).toBeTruthy();
  });

  it("never renders both age lines together", () => {
    render(<RiskBreakdownPopover risk={baseRisk({ ageModifier: 1, ageModifierSuppressed: false })} ambulant={null} />);
    expect(screen.queryByText(/suppressed/i)).toBeNull();
  });

  it("backwards-compat: snapshot without inputSource but with partial=true → preliminary", () => {
    const r = baseRisk();
    delete (r as any).inputSource;
    r.partial = true;
    render(<RiskBreakdownPopover risk={r} ambulant={null} />);
    expect(screen.getByText(/preliminary/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx -t "preliminary"
```

Expected: failures on missing preliminary text + missing suppressed text.

- [ ] **Step 3: Update `client/src/components/anesthesia/RiskBreakdownPopover.tsx`**

Replace the file with:

```tsx
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isPreliminary, type PerioperativeRiskResult, type DomainKey } from "@shared/scoring/perioperativeRisk";

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
  /** Called when the user clicks outside the popover or presses Escape. */
  onClose?: () => void;
}

export function RiskBreakdownPopover({ risk, ambulant, onClose }: RiskBreakdownPopoverProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const preliminary = isPreliminary(risk);

  useEffect(() => {
    if (!onClose) return;
    const onMouseDown = (e: MouseEvent) => {
      const node = ref.current;
      if (!node) return;
      const target = e.target as Node | null;
      if (target && !node.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onMouseDown, true);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="w-80 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl">
      {preliminary && (
        <div className="text-[11px] text-amber-300 mb-2" data-testid="popover-preliminary-note">
          ⓘ {t("popover.preliminaryNote")}
        </div>
      )}
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
      {risk.ageModifierSuppressed && (
        <div className="text-[11px] text-slate-400 mb-2" data-testid="popover-age-suppressed-note">
          ⓘ {t("popover.ageSuppressedNote")}
        </div>
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

- [ ] **Step 4: Run the new tests, confirm they pass**

```bash
npx vitest run client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx -t "preliminary"
```

Expected: 6/6 green.

- [ ] **Step 5: Run the full popover test file, confirm no regressions**

```bash
npx vitest run client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/RiskBreakdownPopover.tsx client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx
git commit -m "$(cat <<'EOF'
feat(risk): preliminary header + suppressed-bump line on popover

Two optional single-line additions to RiskBreakdownPopover:
- Amber 'Preliminary -- based on patient questionnaire (no anesthesia
  pre-op assessment yet)' header when isPreliminary(risk) is true.
- Slate 'Age >=75 bump suppressed (minor surgery)' line when
  ageModifierSuppressed is true.

The existing 'bumped up one band' amber line stays as-is. The two age
lines are mutually exclusive at the snapshot level.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Wire `preliminary` at all call sites

**Files (grep-driven — exact paths confirmed in Step 1):**
- Modify: every file that renders `<RiskChip ... risk-snapshot-derived ... />`

- [ ] **Step 1: Find every call site of `RiskChip` that has access to the snapshot**

```bash
grep -rn "<RiskChip" client/src --include='*.tsx' --include='*.ts'
```

Expected output: lists ~6-10 sites. For each one, check whether the parent has a `PerioperativeRiskResult` available (it typically does — that's how `worstDomain` and `grade` are passed today).

- [ ] **Step 2: For every site that has the snapshot, add `preliminary={isPreliminary(snapshot)}`**

Import where needed:

```ts
import { isPreliminary } from "@shared/scoring/perioperativeRisk";
```

Example transformation:

```tsx
// BEFORE
<RiskChip grade={risk?.grade ?? null} worstDomain={risk?.worstDomain} onClick={...} />

// AFTER
<RiskChip grade={risk?.grade ?? null} worstDomain={risk?.worstDomain} preliminary={isPreliminary(risk)} onClick={...} />
```

Same change for the compact variant on calendar tiles:

```tsx
// BEFORE
<RiskChip compact={true} grade={risk?.grade ?? null} insufficient={!risk} />

// AFTER
<RiskChip compact={true} grade={risk?.grade ?? null} insufficient={!risk} preliminary={isPreliminary(risk)} />
```

**Sites to check (non-exhaustive — confirm with the grep above):**
- `client/src/pages/PatientDetail.tsx` (sticky header and main header — usually 2 chips)
- `client/src/components/pacu/*.tsx` (PACU patient card)
- `client/src/components/calendar/OPCalendarDay*.tsx`
- `client/src/components/calendar/OPCalendarMonth*.tsx`
- `client/src/components/calendar/TimelineWeekView.tsx` (week-view hover — the chip and popover go together; passing the full snapshot is enough)

If a call site has only `grade` (no snapshot), it cannot determine preliminary state — leave it alone. Such sites are rare; the typical pattern is the parent fetches the full snapshot.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: clean. If a call site doesn't pass `preliminary`, that's fine — the prop defaults to `false`.

- [ ] **Step 4: Run all component tests**

```bash
npx vitest run client/src --reporter verbose
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "$(cat <<'EOF'
feat(risk): wire preliminary across all RiskChip call sites

Every place that renders RiskChip with a snapshot in scope now passes
preliminary={isPreliminary(snapshot)}. Sites without snapshot access
leave the prop unset (defaults to false).

Affected sites: patient headers (sticky + main), PACU card, OP calendar
Day + Month tiles, week-view hover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — `/risk-methodology` page rewrite

**Files:**
- Modify: `client/src/pages/RiskMethodology.tsx`
- Modify: `client/src/pages/__tests__/RiskMethodology.test.tsx`

- [ ] **Step 1: Append failing tests to `RiskMethodology.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskMethodology } from "../RiskMethodology";

describe("RiskMethodology — How calculated section", () => {
  it("renders the 'How the final grade is calculated' heading", () => {
    render(<RiskMethodology />);
    expect(screen.getByTestId("how-calculated-section")).toBeTruthy();
  });

  it("renders all four worked example titles", () => {
    render(<RiskMethodology />);
    expect(screen.getByTestId("example-a")).toBeTruthy();
    expect(screen.getByTestId("example-b")).toBeTruthy();
    expect(screen.getByTestId("example-c")).toBeTruthy();
    expect(screen.getByTestId("example-d")).toBeTruthy();
  });

  it("still renders the five domain sections (regression)", () => {
    render(<RiskMethodology />);
    expect(screen.getByText(/RCRI/i)).toBeTruthy();        // cardiac
    expect(screen.getByText(/Caprini/i)).toBeTruthy();     // vte
    expect(screen.getByText(/Viali pulmonary/i)).toBeTruthy(); // pulmonary
    expect(screen.getByText(/mFI-5/i)).toBeTruthy();       // frailty (in body text)
    expect(screen.getByText(/Surgery weight/i)).toBeTruthy(); // surgery
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run client/src/pages/__tests__/RiskMethodology.test.tsx -t "How calculated"
```

Expected: failures on missing testids.

- [ ] **Step 3: Replace `client/src/pages/RiskMethodology.tsx`**

```tsx
import { useTranslation } from "react-i18next";

export function RiskMethodology() {
  const { t } = useTranslation();

  const sections: Array<{ titleKey: string; bodyKey: string }> = [
    { titleKey: "riskMethodology.cardiac.title", bodyKey: "riskMethodology.cardiac.body" },
    { titleKey: "riskMethodology.vte.title", bodyKey: "riskMethodology.vte.body" },
    { titleKey: "riskMethodology.pulmonary.title", bodyKey: "riskMethodology.pulmonary.body" },
    { titleKey: "riskMethodology.frailty.title", bodyKey: "riskMethodology.frailty.body" },
    { titleKey: "riskMethodology.surgery.title", bodyKey: "riskMethodology.surgery.body" },
  ];

  const examples = ["a", "b", "c", "d"] as const;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100" data-testid="page-risk-methodology">
      <h1 className="text-2xl font-bold mb-2">{t("riskMethodology.title")}</h1>
      <p className="text-slate-300 mb-6">{t("riskMethodology.intro")}</p>

      <section className="mb-8" data-testid="how-calculated-section">
        <h2 className="text-xl font-semibold mb-3">{t("riskMethodology.howCalculated.title")}</h2>
        <p className="text-slate-300 mb-3 whitespace-pre-line">{t("riskMethodology.howCalculated.pipeline")}</p>
        <p className="text-slate-300 mb-3">{t("riskMethodology.howCalculated.tiebreaker")}</p>
        <p className="text-slate-300 mb-3">{t("riskMethodology.howCalculated.attenuation")}</p>
        <p className="text-slate-300 mb-4">{t("riskMethodology.howCalculated.preliminary")}</p>

        <h3 className="text-base font-semibold mb-2 mt-6">{t("riskMethodology.howCalculated.examplesHeading")}</h3>
        <div className="space-y-3">
          {examples.map((key) => (
            <div
              key={key}
              className="rounded border border-slate-700 bg-slate-800/40 px-3 py-2"
              data-testid={`example-${key}`}
            >
              <div className="font-semibold text-slate-100 mb-1">
                {t(`riskMethodology.howCalculated.examples.${key}.title`)}
              </div>
              <div className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Facts:</span>{" "}
                {t(`riskMethodology.howCalculated.examples.${key}.facts`)}
              </div>
              <div className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Bands:</span>{" "}
                {t(`riskMethodology.howCalculated.examples.${key}.bands`)}
              </div>
              <div className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Modifier:</span>{" "}
                {t(`riskMethodology.howCalculated.examples.${key}.modifier`)}
              </div>
              <div className="text-sm text-slate-100 font-semibold">
                → {t(`riskMethodology.howCalculated.examples.${key}.result`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {sections.map(({ titleKey, bodyKey }) => (
        <section className="mb-6" key={titleKey}>
          <h2 className="text-xl font-semibold mb-2">{t(titleKey)}</h2>
          <p className="text-slate-300">{t(bodyKey)}</p>
        </section>
      ))}

      <footer className="text-xs text-slate-500 border-t border-slate-700 pt-4 mt-2">
        {t("riskMethodology.footer")}
      </footer>
    </div>
  );
}

export default RiskMethodology;
```

> **Note:** the old `aggregation` paragraph is intentionally removed — its content is now folded into `howCalculated.pipeline` (which the translation key supplies; see Task 9).

- [ ] **Step 4: Run the new tests, confirm they pass**

```bash
npx vitest run client/src/pages/__tests__/RiskMethodology.test.tsx
```

Expected: all green (including the regression test for the existing domain sections, which still render — note "mFI-5" appears in the frailty body text, "Surgery weight" in the surgery title).

- [ ] **Step 5: TypeScript check**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/RiskMethodology.tsx client/src/pages/__tests__/RiskMethodology.test.tsx
git commit -m "$(cat <<'EOF'
feat(risk): rewrite /risk-methodology with How-it-is-calculated section

New top section explains the pipeline (domain bands -> worst-domain ->
age modifier -> attenuation -> final grade), the tiebreaker priority,
the attenuation rule and its rationale, and the preliminary scoring
behaviour. Includes 4 worked examples in compact panels:

A) 82F smoker, minor          -> ORANGE . VTE
B) 82F smoker, large           -> RED . VTE
C) 70M CAD+CHF+CKD, minor      -> RED . CARDIAC (attenuation doesn't mask)
D) Same as A, questionnaire-only -> ORANGE . VTE . ~ (Preliminary)

Existing 5 domain sections retained underneath. Old standalone
'aggregation' paragraph folded into the new pipeline text.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — i18n keys (EN + DE)

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add EN keys**

In `client/src/i18n/locales/en.json`, find the `"riskMethodology": {` block. Inside it, replace the existing `"intro"`, `"aggregation"`, and surrounding structure so the resulting object contains the existing keys **plus** the new ones below. The final shape inside `"riskMethodology"` must include:

```json
    "title": "Perioperative Risk Grade",
    "intro": "The risk grade is a single green / orange / red signal showing global perioperative risk. It is computed automatically from existing patient and surgery data and updates whenever comorbidities, the questionnaire, or the surgery itself changes.",
    "howCalculated": {
      "title": "How the final grade is calculated",
      "pipeline": "Pipeline: patient + surgery → 5 independent domain bands (cardiac, VTE, pulmonary, frailty, surgery) → worst-domain wins → age modifier (≥ 75 bumps up one band, except on minor/standard surgery) → final grade (LOW / MED / HIGH). The grade is never bumped down.",
      "tiebreaker": "If two domains share the worst band, the headline driver is chosen in this order: cardiac → VTE → pulmonary → frailty → surgery.",
      "attenuation": "Attenuation rule: when the surgery is minor or standard, the age-≥-75 bump is suppressed. A low-risk procedure does not amplify age-driven baseline risk — domain bands are still shown unchanged so the underlying picture stays visible.",
      "preliminary": "Risk is calculated as soon as the patient submits the questionnaire and is refined once the anesthesia pre-op assessment is completed. The anesthetist's entry overrides patient-reported data on a per-condition basis. Preliminary grades are shown with a dashed border and a tilde marker (~).",
      "examplesHeading": "Worked examples",
      "examples": {
        "a": {
          "title": "Example A — Eva-like patient on a minor surgery",
          "facts": "82-year-old female, current smoker, no comorbidities. Outpatient hernia repair.",
          "bands": "Cardiac LOW · VTE MED · Pulmonary MED · Frailty LOW · Surgery LOW",
          "modifier": "Age ≥ 75 but surgery is minor — bump suppressed.",
          "result": "ORANGE · VTE (MED tier; not escalated to HIGH)"
        },
        "b": {
          "title": "Example B — same patient, large surgery",
          "facts": "Same 82-year-old female smoker. Total hip replacement (large).",
          "bands": "Cardiac LOW · VTE MED · Pulmonary MED · Frailty LOW · Surgery MED",
          "modifier": "Age ≥ 75 and surgery is large — bump applies.",
          "result": "RED · VTE (age modifier correctly re-escalates on a high-impact procedure)"
        },
        "c": {
          "title": "Example C — sick patient, minor surgery",
          "facts": "70-year-old male with CAD, CHF, CKD, functional dependence. Cataract (minor).",
          "bands": "Cardiac HIGH · VTE LOW · Pulmonary LOW · Frailty MED · Surgery LOW",
          "modifier": "Age < 75 — modifier not eligible.",
          "result": "RED · CARDIAC (attenuation does not mask a genuinely high-domain patient)"
        },
        "d": {
          "title": "Example D — questionnaire only, no pre-op assessment yet",
          "facts": "Same patient as Example A. Patient submitted the questionnaire; anesthesia pre-op not yet completed.",
          "bands": "Computed from questionnaire-reported data; same bands as Example A.",
          "modifier": "Bump suppressed (minor surgery).",
          "result": "ORANGE · VTE · ~ (Preliminary — refines once the anesthetist completes the pre-op assessment)"
        }
      }
    },
    "cardiac": { "title": "Cardiac — RCRI", "body": "Revised Cardiac Risk Index (Lee et al., 1999). Counts of: high-risk surgery, ischemic heart disease, congestive heart failure, cerebrovascular disease, insulin-dependent diabetes, serum creatinine > 2 mg/dL. Bands: low (0 pts) / med (1 pt) / high (≥ 2 pts)." },
    "vte": { "title": "VTE — Caprini", "body": "Caprini score for venous thromboembolism risk. Combines age, BMI, surgery type, malignancy, mobility, VTE history, varicose veins, hormonal therapy, and pregnancy. Bands: low (0–2 pts) / med (3–4 pts) / high (≥ 5 pts)." },
    "pulmonary": { "title": "Pulmonary — Viali pulmonary v1", "body": "Custom Viali approximation. Bands: high if COPD present; med if current smoker AND (age ≥ 70 OR planned duration > 180 min); otherwise low. This is not a validated published score — it is an explicit approximation using only inputs we already capture. A future iteration will replace it with full ARISCAT once SpO2, recent respiratory infection, and Hb capture are added." },
    "frailty": { "title": "Frailty — mFI-5", "body": "5-Factor Modified Frailty Index. Counts of: diabetes, COPD / recent pneumonia, congestive heart failure, hypertension requiring meds, and functional dependence in daily activities. Bands: low (0) / med (1–2) / high (≥ 3). If the functional-dependence question has not been answered, the score runs on the 4 remaining factors." },
    "surgery": { "title": "Surgery weight", "body": "Bands directly from the surgery's risk class: minor / standard → low, large → med, critical → high. Standard procedures (cataract, lap chole, hernia, lid surgery, arthroscopy, etc.) carry < 1% baseline MACE for a healthy patient and do not contribute a surgery-axis bump on their own — comorbidities still drive the cardiac, VTE, pulmonary, and frailty axes." },
    "footer": "Methodology v1.1 · effective 2026-05-14. Threshold or formula changes will bump the version number."
```

Remove the old top-level `"aggregation"` key from inside `"riskMethodology"` if still present (its content is now in `howCalculated.pipeline`).

Also add (top-level peers of `riskMethodology` — typically near where similar UI namespaces live):

```json
  "chip": {
    "preliminaryTooltip": "Preliminary — based on patient questionnaire only"
  },
  "popover": {
    "preliminaryNote": "Preliminary — based on patient questionnaire (no anesthesia pre-op assessment yet)",
    "ageSuppressedNote": "Age ≥ 75 bump suppressed (minor surgery)"
  }
```

> If `"chip"` or `"popover"` already exist, merge into them rather than redefining.

- [ ] **Step 2: Add DE keys**

In `client/src/i18n/locales/de.json`, mirror the same structure with formal clinical wording (no second-person "Du"):

```json
    "howCalculated": {
      "title": "So wird die Endbewertung berechnet",
      "pipeline": "Ablauf: Patient + Eingriff → 5 unabhängige Domänen-Bänder (kardial, VTE, pulmonal, Frailty, Chirurgie) → das schwerste Band entscheidet → Alters-Modifier (≥ 75 hebt um ein Band an, ausgenommen bei kleinen / Standard-Eingriffen) → Endbewertung (NIEDRIG / MITTEL / HOCH). Eine Abstufung nach unten erfolgt nie.",
      "tiebreaker": "Bei gleichem Band gilt folgende Priorität für das Leit-Domain: kardial → VTE → pulmonal → Frailty → Chirurgie.",
      "attenuation": "Attenuierungsregel: Bei kleinen oder Standard-Eingriffen wird der Alters-Modifier (≥ 75) unterdrückt. Ein risikoarmer Eingriff verstärkt das altersbedingte Grundrisiko nicht — die Domänen-Bänder bleiben unverändert sichtbar.",
      "preliminary": "Die Risikobewertung wird berechnet, sobald der Patient den Fragebogen einreicht, und nach Abschluss der anästhesiologischen Prä-OP-Beurteilung verfeinert. Eintragungen der Anästhesie überschreiben die Selbstangaben des Patienten pro Punkt. Vorläufige Bewertungen sind durch einen gestrichelten Rand und ein Tilde-Symbol (~) gekennzeichnet.",
      "examplesHeading": "Praxisbeispiele",
      "examples": {
        "a": {
          "title": "Beispiel A — Eva-Profil, kleiner Eingriff",
          "facts": "82-jährige Patientin, aktive Raucherin, keine Komorbiditäten. Ambulante Hernienoperation.",
          "bands": "Kardial NIEDRIG · VTE MITTEL · Pulmonal MITTEL · Frailty NIEDRIG · Chirurgie NIEDRIG",
          "modifier": "Alter ≥ 75, aber kleiner Eingriff — Anhebung unterdrückt.",
          "result": "ORANGE · VTE (MITTEL; keine Hochstufung auf HOCH)"
        },
        "b": {
          "title": "Beispiel B — gleiche Patientin, grosser Eingriff",
          "facts": "Gleiche 82-jährige Raucherin. Totale Hüftendoprothese (grosser Eingriff).",
          "bands": "Kardial NIEDRIG · VTE MITTEL · Pulmonal MITTEL · Frailty NIEDRIG · Chirurgie MITTEL",
          "modifier": "Alter ≥ 75 und grosser Eingriff — Anhebung greift.",
          "result": "ROT · VTE (Alters-Modifier eskaliert bei grossen Eingriffen wie vorgesehen)"
        },
        "c": {
          "title": "Beispiel C — kranker Patient, kleiner Eingriff",
          "facts": "70-jähriger Patient mit KHK, Herzinsuffizienz, Niereninsuffizienz, funktionell abhängig. Kataraktoperation (klein).",
          "bands": "Kardial HOCH · VTE NIEDRIG · Pulmonal NIEDRIG · Frailty MITTEL · Chirurgie NIEDRIG",
          "modifier": "Alter < 75 — Modifier nicht anwendbar.",
          "result": "ROT · KARDIAL (Attenuierung verdeckt schwere Domänen-Risiken nicht)"
        },
        "d": {
          "title": "Beispiel D — nur Fragebogen, noch keine Prä-OP-Beurteilung",
          "facts": "Gleicher Patient wie in Beispiel A. Fragebogen eingereicht; anästhesiologische Prä-OP noch nicht abgeschlossen.",
          "bands": "Berechnet auf Basis der Selbstangaben aus dem Fragebogen; gleiche Bänder wie Beispiel A.",
          "modifier": "Anhebung unterdrückt (kleiner Eingriff).",
          "result": "ORANGE · VTE · ~ (Vorläufig — wird mit dem Pre-OP-Befund der Anästhesie verfeinert)"
        }
      }
    },
```

DE chip/popover keys:

```json
  "chip": {
    "preliminaryTooltip": "Vorläufig — nur basierend auf dem Patientenfragebogen"
  },
  "popover": {
    "preliminaryNote": "Vorläufig — basierend auf dem Patientenfragebogen (anästhesiologische Prä-OP-Beurteilung noch ausstehend)",
    "ageSuppressedNote": "Alter ≥ 75 — Anhebung unterdrückt (kleiner Eingriff)"
  }
```

If existing IT / ES / FR / ZH locale files have a `riskMethodology` block, copy the EN strings as a placeholder so the page doesn't break on those locales (the translation-pass follow-up will localize them later).

- [ ] **Step 3: TypeScript check + verify JSON files parse**

```bash
npm run check
node -e "JSON.parse(require('fs').readFileSync('client/src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('client/src/i18n/locales/de.json','utf8')); console.log('ok')"
```

Expected: clean TypeScript pass, `ok` printed for the JSON parse.

- [ ] **Step 4: Run all UI tests (which now resolve the new keys)**

```bash
npx vitest run client/src --reporter verbose
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "$(cat <<'EOF'
i18n(risk): EN + DE keys for preliminary state and methodology rewrite

Adds:
- riskMethodology.howCalculated.{title, pipeline, tiebreaker,
  attenuation, preliminary, examplesHeading, examples.a-d.{title,
  facts, bands, modifier, result}}
- chip.preliminaryTooltip
- popover.preliminaryNote
- popover.ageSuppressedNote

DE uses formal clinical tone. IT/ES/FR/ZH carry EN placeholders if
those locale files exist; full translation pass tracked separately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — Verify questionnaire-submit recompute hook is intact

**Files:** none modified. This is a verification-only task — the hooks already exist.

- [ ] **Step 1: Confirm both questionnaire-write paths still call `recomputeRiskForPatientFutureSurgeries`**

```bash
grep -n "recomputeRiskForPatientFutureSurgeries" server/routes/questionnaire.ts
```

Expected output: 2 hits — one around `:605` (`PUT /api/questionnaire/responses/:responseId`) and one around `:1667` (`POST /api/public/questionnaire/:token/submit`).

- [ ] **Step 2: Manually trace each call site to confirm patientId is passed**

Read the surrounding 10 lines of each match. Each must call `recomputeRiskForPatientFutureSurgeries(link.patientId)` inside a non-blocking `try/catch` that does not surface errors to the response.

If a call is missing or in the wrong scope, fix it and add a unit test. Otherwise, no change.

- [ ] **Step 3: (Optional) commit a no-op marker if you reorganized — otherwise skip**

If you made any change in this task, commit it. Otherwise this task is recorded as verified-only and moves on.

---

## Task 11 — Deploy-day notes

**Files:**
- Modify: `replit.md` (or `docs/deploy.md`, whichever exists)

- [ ] **Step 1: Locate the deploy notes file**

```bash
ls replit.md docs/deploy.md 2>/dev/null
```

If neither exists, skip to Step 3 and create a new section directly in the spec's "Manual smoke checklist" — but most likely `replit.md` exists.

- [ ] **Step 2: Append a deploy-day section**

Add this section to the file (near other risk-grade deploy notes if they exist):

```markdown
## Risk Grade — Surgery-Class Attenuation & Preliminary State (2026-05-14)

After deploy:

1. Run the backfill to repopulate snapshots with the new fields
   (`ageEligible`, `ageModifierSuppressed`, `inputSource`):

   ```
   BACKFILL_DAYS_AGO=365 node scripts/run-with-pm2-env.cjs scripts/backfill-risk-grade.ts
   ```

   Idempotent — safe to re-run.

2. Manual smoke (see plan §4.7 in
   `docs/superpowers/specs/2026-05-14-risk-grade-attenuation-and-preliminary-design.md`):

   - Eva Steiner's surgery shows MED · VTE (was HIGH · VTE).
   - Popover for any age-<75 surgery has neither the suppressed nor the
     bumped-up amber line.
   - A patient with only a submitted questionnaire shows a dashed chip
     with `· ~` and the Preliminary header in the popover.
   - After the anesthetist saves a pre-op assessment, the chip becomes
     solid (no tilde, no dashed border).
   - `/risk-methodology` shows the new top section and all 4 worked
     examples; the 5 existing domain sections still render below.
```

- [ ] **Step 3: Commit**

```bash
git add replit.md
git commit -m "docs(deploy): risk-grade attenuation + preliminary backfill steps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> If you needed to create a new file instead, `git add` that path.

---

## Task 12 — Final verification

**Files:** none modified. Final gate before declaring done.

- [ ] **Step 1: Run the complete test suite**

```bash
npx vitest run --reporter verbose
```

Expected: all green, no skipped tests other than ones already skipped on `main`.

- [ ] **Step 2: TypeScript check**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 3: Spot-check production build**

```bash
npm run build
```

Expected: build succeeds, no warnings beyond what `main` already produces.

- [ ] **Step 4: Walk the manual smoke checklist**

Same six steps as in the spec (§4.7). Start the dev server with `npm run dev`, log in as a clinician, and exercise:

1. Eva Steiner (or any age-≥75 + minor-surgery patient) — chip is **MED · VTE** (orange, solid).
2. Any age-<75 surgery — popover has neither the suppressed nor the bumped line.
3. A patient with only a submitted questionnaire (no anesthesia pre-op) — chip is dashed with ` · ~`; popover top line is amber Preliminary.
4. Open that patient's pre-op assessment, tick one illness, save. Chip becomes solid.
5. `/risk-methodology` shows the new top section + 4 examples; the 5 domain sections still render.
6. Run the backfill against a staging hospital first; confirm the surgery count updated; then run for `BACKFILL_DAYS_AGO=365` on production after deploy.

- [ ] **Step 5: Decide handoff**

If everything passes, push the branch and follow the `superpowers:finishing-a-development-branch` flow (open PR, request review, etc.).

```bash
git log --oneline main..feat/risk-grade-attenuation
```

Expected: about 10 commits (one per task that produced changes).

---

## Files touched (final inventory)

**Modified:**
- `shared/scoring/perioperativeRisk.ts` — Task 1 + 2
- `shared/scoring/__tests__/perioperativeRisk.test.ts` — Task 1 + 2
- `server/scoring/computePerioperativeRisk.ts` — Task 4
- `client/src/components/anesthesia/RiskChip.tsx` — Task 5
- `client/src/components/anesthesia/__tests__/RiskChip.test.tsx` — Task 5
- `client/src/components/anesthesia/RiskBreakdownPopover.tsx` — Task 6
- `client/src/components/anesthesia/__tests__/RiskBreakdownPopover.test.tsx` — Task 6
- `client/src/pages/RiskMethodology.tsx` — Task 8
- `client/src/pages/__tests__/RiskMethodology.test.tsx` — Task 8
- `client/src/i18n/locales/en.json` — Task 9
- `client/src/i18n/locales/de.json` — Task 9
- `replit.md` — Task 11
- Multiple call sites under `client/src/pages/` and `client/src/components/` — Task 7

**Created:**
- `server/scoring/projectQuestionnaireConditionsToOrganMaps.ts` — Task 3
- `server/scoring/__tests__/projectQuestionnaireConditionsToOrganMaps.test.ts` — Task 3
- `server/scoring/__tests__/computePerioperativeRisk.test.ts` — Task 4

**No DB migration.** All new snapshot fields live in the existing `surgeries.perioperativeRisk` JSONB column; backfill repopulates.

**No schema change.** The `IllnessLists` type already supports `category` keys; the questionnaire already writes `conditions` in the shape the new projection helper expects.
