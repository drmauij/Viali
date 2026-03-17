# TCI Pharmacokinetic Simulation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time PK simulation (Cp/Ce/eBIS) to the anesthesia record for TIVA cases using Eleveld (propofol) and Minto (remifentanil) models.

**Architecture:** Pure TypeScript PK engine (`client/src/lib/pharmacokinetics/`) with a TCI controller that converts target concentrations to infusion rates, feeds them through a 3-compartment analytical solver, and produces time-series predictions. A React hook (`usePKSimulation`) auto-activates for TCI cases. A new PKPredictionSwimlane renders Cp/Ce curves, and eBIS overlays the existing BIS swimlane. No database changes — predictions are reconstructed on demand.

**Tech Stack:** TypeScript, React, Vitest (unit tests), SVG rendering, existing UnifiedTimeline swimlane architecture.

**Spec:** `docs/superpowers/specs/2026-03-17-tci-pk-simulation-design.md`

---

## File Structure

### New Files (Create)

| File | Responsibility |
|------|---------------|
| `client/src/lib/pharmacokinetics/types.ts` | All PK types: `PatientCovariates`, `TargetEvent`, `PKModelParameters`, `PKState`, `PKTimePoint` |
| `client/src/lib/pharmacokinetics/engine.ts` | 3-compartment analytical solver: takes rate constants + infusion rates → compartment concentrations |
| `client/src/lib/pharmacokinetics/tci-controller.ts` | TCI controller: takes model params + target events → computed infusion rates per time step |
| `client/src/lib/pharmacokinetics/models/eleveld-propofol.ts` | Eleveld 2018 model: patient covariates → PK parameters (V1-V3, CL1-CL3, ke0) + eBIS Hill equation |
| `client/src/lib/pharmacokinetics/models/minto-remifentanil.ts` | Minto 1997 model: patient covariates → PK parameters |
| `client/src/lib/pharmacokinetics/simulate.ts` | Orchestrator: patient + target events → `PKTimePoint[]` time series |
| `client/src/lib/pharmacokinetics/index.ts` | Public API barrel export |
| `client/src/hooks/usePKSimulation.ts` | React hook: auto-detects TCI, runs simulation, manages dismiss state |
| `client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx` | New swimlane: renders Cp/Ce curves as SVG |
| `tests/pharmacokinetics/types.test.ts` | Tests for type validation helpers |
| `tests/pharmacokinetics/engine.test.ts` | Tests for 3-compartment solver |
| `tests/pharmacokinetics/tci-controller.test.ts` | Tests for TCI rate computation |
| `tests/pharmacokinetics/eleveld-propofol.test.ts` | Tests for Eleveld model parameters + eBIS |
| `tests/pharmacokinetics/minto-remifentanil.test.ts` | Tests for Minto model parameters |
| `tests/pharmacokinetics/simulate.test.ts` | End-to-end simulation tests |

### Modified Files

| File | Changes |
|------|---------|
| `client/src/components/anesthesia/UnifiedTimeline.tsx` | Reorder swimlanes, add PK swimlane rendering, pass eBIS data to BISSwimlane |
| `client/src/components/anesthesia/swimlanes/BISSwimlane.tsx` | Add optional `eBISTimeSeries` prop, render dashed eBIS line |
| `client/src/lib/anesthesiaRecordPdf.ts` | Add PK simulation data to PDF export |

---

## Chunk 1: PK Engine Core

### Task 1: Types and Validation

**Files:**
- Create: `client/src/lib/pharmacokinetics/types.ts`
- Create: `tests/pharmacokinetics/types.test.ts`

- [ ] **Step 1: Write the failing test for PatientCovariates validation**

```typescript
// tests/pharmacokinetics/types.test.ts
import { describe, it, expect } from "vitest";
import { validateCovariates, parsePatientCovariates } from "../client/src/lib/pharmacokinetics/types";

describe("PatientCovariates", () => {
  describe("validateCovariates", () => {
    it("returns valid for complete covariates", () => {
      const result = validateCovariates({ age: 40, weight: 70, height: 170, sex: "male" });
      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it("rejects zero weight", () => {
      const result = validateCovariates({ age: 40, weight: 0, height: 170, sex: "male" });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("weight");
    });

    it("rejects negative age", () => {
      const result = validateCovariates({ age: -1, weight: 70, height: 170, sex: "male" });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("age");
    });
  });

  describe("parsePatientCovariates", () => {
    it("parses valid raw data", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "M",
        weight: "70",
        height: "170",
      });
      expect(result.covariates).not.toBeNull();
      const expectedAge = new Date().getFullYear() - 1986 - (new Date() < new Date(new Date().getFullYear() + '-03-17') ? 1 : 0);
      expect(result.covariates!.age).toBe(expectedAge);
      expect(result.covariates!.sex).toBe("male");
      expect(result.covariates!.weight).toBe(70);
      expect(result.covariates!.height).toBe(170);
      expect(result.missingFields).toEqual([]);
    });

    it("strips unit suffixes from weight/height", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "F",
        weight: "85 kg",
        height: "165cm",
      });
      expect(result.covariates!.weight).toBe(85);
      expect(result.covariates!.height).toBe(165);
      expect(result.covariates!.sex).toBe("female");
    });

    it("defaults sex O to male with note", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "O",
        weight: "70",
        height: "170",
      });
      expect(result.covariates!.sex).toBe("male");
      expect(result.sexDefaultApplied).toBe(true);
    });

    it("reports missing fields when data incomplete", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "M",
        weight: null,
        height: "170",
      });
      expect(result.covariates).toBeNull();
      expect(result.missingFields).toContain("weight");
    });

    it("reports missing birthday", () => {
      const result = parsePatientCovariates({
        birthday: null,
        sex: "M",
        weight: "70",
        height: "170",
      });
      expect(result.covariates).toBeNull();
      expect(result.missingFields).toContain("age");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pharmacokinetics/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write types and validation**

```typescript
// client/src/lib/pharmacokinetics/types.ts

// ── Patient ──────────────────────────────────────────────

export interface PatientCovariates {
  age: number;        // years
  weight: number;     // kg
  height: number;     // cm
  sex: "male" | "female";
}

export interface CovariateValidation {
  valid: boolean;
  missingFields: string[];
}

export interface ParseResult {
  covariates: PatientCovariates | null;
  missingFields: string[];
  sexDefaultApplied: boolean;
}

export function validateCovariates(c: PatientCovariates): CovariateValidation {
  const missing: string[] = [];
  if (c.age === undefined || c.age === null || c.age < 18 || c.age > 120) missing.push("age");
  if (!c.weight || c.weight <= 0 || c.weight > 300) missing.push("weight");
  if (!c.height || c.height <= 0 || c.height > 300) missing.push("height");
  return { valid: missing.length === 0, missingFields: missing };
}

export function parsePatientCovariates(raw: {
  birthday?: string | null;
  sex?: string | null;
  weight?: string | null;
  height?: string | null;
}): ParseResult {
  const missing: string[] = [];
  let sexDefaultApplied = false;

  // Age from birthday
  let age: number | null = null;
  if (raw.birthday) {
    const birth = new Date(raw.birthday);
    const now = new Date();
    age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
  } else {
    missing.push("age");
  }

  // Weight — strip unit suffixes
  let weight: number | null = null;
  if (raw.weight) {
    weight = parseFloat(raw.weight.replace(/[^0-9.]/g, ""));
    if (isNaN(weight) || weight <= 0) { weight = null; missing.push("weight"); }
  } else {
    missing.push("weight");
  }

  // Height — strip unit suffixes
  let height: number | null = null;
  if (raw.height) {
    height = parseFloat(raw.height.replace(/[^0-9.]/g, ""));
    if (isNaN(height) || height <= 0) { height = null; missing.push("height"); }
  } else {
    missing.push("height");
  }

  // Sex — map M/F/O
  let sex: "male" | "female" = "male";
  if (raw.sex === "F") {
    sex = "female";
  } else if (raw.sex === "O" || !raw.sex) {
    sex = "male";
    sexDefaultApplied = true;
  }

  if (missing.length > 0 || age === null || weight === null || height === null) {
    return { covariates: null, missingFields: missing, sexDefaultApplied };
  }

  return {
    covariates: { age, weight, height, sex },
    missingFields: [],
    sexDefaultApplied,
  };
}

// ── PK Model ─────────────────────────────────────────────

export interface PKModelParameters {
  v1: number;   // Central compartment volume (L)
  v2: number;   // Peripheral 1 volume (L)
  v3: number;   // Peripheral 2 volume (L)
  cl1: number;  // Elimination clearance (L/min)
  cl2: number;  // Inter-compartmental clearance 1 (L/min)
  cl3: number;  // Inter-compartmental clearance 2 (L/min)
  ke0: number;  // Effect-site equilibration rate constant (min⁻¹)
  // Derived rate constants
  k10: number;  // cl1/v1
  k12: number;  // cl2/v1
  k21: number;  // cl2/v2
  k13: number;  // cl3/v1
  k31: number;  // cl3/v3
}

export function deriveRateConstants(
  v1: number, v2: number, v3: number,
  cl1: number, cl2: number, cl3: number,
  ke0: number,
): PKModelParameters {
  return {
    v1, v2, v3, cl1, cl2, cl3, ke0,
    k10: cl1 / v1,
    k12: cl2 / v1,
    k21: cl2 / v2,
    k13: cl3 / v1,
    k31: cl3 / v3,
  };
}

// ── Simulation I/O ───────────────────────────────────────

export interface TargetEvent {
  type: "start" | "rate_change" | "stop";
  timestamp: number;           // ms epoch
  targetConcentration: number; // μg/ml (propofol) or ng/ml (remi)
}

export interface PKTimePoint {
  timestamp: number;
  propofolCp: number | null;
  propofolCe: number | null;
  remiCp: number | null;
  remiCe: number | null;
  eBIS: number | null;
}

export const CPT_INTERVAL_S = 10; // 10-second time steps for smooth display
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pharmacokinetics/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/pharmacokinetics/types.ts tests/pharmacokinetics/types.test.ts
git commit -m "feat(pk): add PK simulation types and patient covariate parsing"
```

---

### Task 2: Eleveld Propofol Model

**Files:**
- Create: `client/src/lib/pharmacokinetics/models/eleveld-propofol.ts`
- Create: `tests/pharmacokinetics/eleveld-propofol.test.ts`

**Reference:** Eleveld DJ et al. BJA 2018, Table 2 (parameter estimates). The model calculates V1-V3, CL1-CL3 from patient covariates using allometric scaling and age-dependent maturation functions.

**IMPORTANT for implementer:** The code below is a structural scaffold. Before considering this task complete, you MUST:
1. Cross-reference every theta constant against Eleveld 2018 Table 2 (theta1–theta18)
2. Annotate each constant with its theta index (e.g., `// θ1 = 6.28`)
3. Validate computed parameters for the reference patient (70kg/170cm/35yr male) against published values
4. Compare outputs against simtiva's `index.js` Eleveld implementation for identical inputs

- [ ] **Step 1: Write failing tests for Eleveld parameter calculation**

```typescript
// tests/pharmacokinetics/eleveld-propofol.test.ts
import { describe, it, expect } from "vitest";
import { calculateEleveldPropofol, calculateEBIS } from "../client/src/lib/pharmacokinetics/models/eleveld-propofol";
import type { PatientCovariates } from "../client/src/lib/pharmacokinetics/types";

describe("Eleveld Propofol Model", () => {
  const standardMale: PatientCovariates = { age: 40, weight: 70, height: 170, sex: "male" };
  const elderlyFemale: PatientCovariates = { age: 75, weight: 55, height: 160, sex: "female" };

  describe("calculateEleveldPropofol", () => {
    it("returns valid parameters for standard male", () => {
      const params = calculateEleveldPropofol(standardMale);
      // V1 should be around 6-7L for 70kg adult
      expect(params.v1).toBeGreaterThan(3);
      expect(params.v1).toBeLessThan(15);
      // All volumes and clearances must be positive
      expect(params.v2).toBeGreaterThan(0);
      expect(params.v3).toBeGreaterThan(0);
      expect(params.cl1).toBeGreaterThan(0);
      expect(params.cl2).toBeGreaterThan(0);
      expect(params.cl3).toBeGreaterThan(0);
      expect(params.ke0).toBeGreaterThan(0);
      // Rate constants derived correctly
      expect(params.k10).toBeCloseTo(params.cl1 / params.v1, 6);
      expect(params.k12).toBeCloseTo(params.cl2 / params.v1, 6);
    });

    it("produces smaller clearance for elderly patient", () => {
      const young = calculateEleveldPropofol(standardMale);
      const old = calculateEleveldPropofol(elderlyFemale);
      // Elderly patients have reduced clearance
      expect(old.cl1).toBeLessThan(young.cl1);
    });

    it("produces different V2 for different ages", () => {
      const young = calculateEleveldPropofol(standardMale);
      const old = calculateEleveldPropofol({ ...standardMale, age: 80 });
      expect(young.v2).not.toBeCloseTo(old.v2, 1);
    });
  });

  describe("calculateEBIS", () => {
    it("returns ~100 for zero Ce (awake)", () => {
      const bis = calculateEBIS(0);
      expect(bis).toBeGreaterThan(95);
      expect(bis).toBeLessThanOrEqual(100);
    });

    it("returns 40-60 for surgical anesthesia Ce (~3-4 μg/ml)", () => {
      const bis = calculateEBIS(3.5);
      expect(bis).toBeGreaterThan(30);
      expect(bis).toBeLessThan(65);
    });

    it("returns <30 for deep anesthesia Ce (>6 μg/ml)", () => {
      const bis = calculateEBIS(7);
      expect(bis).toBeLessThan(30);
    });

    it("is monotonically decreasing", () => {
      const bis1 = calculateEBIS(1);
      const bis2 = calculateEBIS(2);
      const bis3 = calculateEBIS(4);
      const bis4 = calculateEBIS(6);
      expect(bis1).toBeGreaterThan(bis2);
      expect(bis2).toBeGreaterThan(bis3);
      expect(bis3).toBeGreaterThan(bis4);
    });

    it("clamps to 0-100 range", () => {
      expect(calculateEBIS(0)).toBeLessThanOrEqual(100);
      expect(calculateEBIS(20)).toBeGreaterThanOrEqual(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pharmacokinetics/eleveld-propofol.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Eleveld model from published parameters**

```typescript
// client/src/lib/pharmacokinetics/models/eleveld-propofol.ts
//
// Eleveld DJ et al. BJA 2018 — Table 2
// Three-compartment PK model with PD (eBIS via Hill equation)
// Implemented from published parameter estimates, NOT derived from simtiva code.

import type { PatientCovariates, PKModelParameters } from "../types";
import { deriveRateConstants } from "../types";

// ── Fat-free mass (Al-Sallami 2015) ──────────────────────

function calculateFFM(weight: number, height: number, age: number, sex: "male" | "female"): number {
  const bmi = weight / ((height / 100) ** 2);
  if (sex === "male") {
    return (0.88 + ((1 - 0.88) / (1 + (age / 13.4) ** (-12.7)))) *
      ((9270 * weight) / (6680 + 216 * bmi));
  } else {
    return (1.11 + ((1 - 1.11) / (1 + (age / 7.1) ** (-1.1)))) *
      ((9270 * weight) / (8780 + 244 * bmi));
  }
}

// ── Sigmoid function for maturation ──────────────────────

function sigmoid(x: number, E50: number, gamma: number): number {
  return (x ** gamma) / (x ** gamma + E50 ** gamma);
}

// ── Eleveld parameter calculation ────────────────────────

export function calculateEleveldPropofol(patient: PatientCovariates): PKModelParameters {
  const { age, weight, height, sex } = patient;
  const ffm = calculateFFM(weight, height, age, sex);
  const isMale = sex === "male";

  // Reference values (70kg, 170cm male)
  const ffmRef = calculateFFM(70, 170, 35, "male");

  // Aging function for maturation (PMA-based, adults: PMA ≈ (age + 0.75) * 52 weeks)
  const pma = (age + 40 / 52) * 52; // Post-menstrual age in weeks for adults
  const thetaCLmaturation = 42.3; // weeks (TM50 for CL maturation)
  const clMaturation = sigmoid(pma, thetaCLmaturation, 9.06);
  const clMaturationRef = sigmoid((35 + 40 / 52) * 52, thetaCLmaturation, 9.06);

  // Central compartment scaling
  const fCentral = (weight: number) => sigmoid(weight, 33.6, 1);

  // ── Volumes ──────────────────────────────────────────
  const v1 = 6.28 * (fCentral(weight) / fCentral(70));
  const v2 = 25.5 * (weight / 70) * Math.exp(-0.0156 * (age - 35));
  const v3 = 273 * (ffm / ffmRef) * Math.exp(-0.0138 * (age - 35));

  // ── Clearances ───────────────────────────────────────
  const cl1 = (isMale ? 1.79 : 2.10) *
    ((weight / 70) ** 0.75) *
    (clMaturation / clMaturationRef) *
    Math.exp(-0.00286 * (age - 35));
  const cl2 = 1.75 * ((v2 / 25.5) ** 0.75) * (1 + 1.3 * (1 - clMaturation));
  const cl3 = 1.11 * ((v3 / 273) ** 0.75) * Math.exp(-0.0260 * (age - 35));

  // ── Effect-site ke0 ──────────────────────────────────
  const ke0 = 0.146 * ((weight / 70) ** (-0.25));

  return deriveRateConstants(v1, v2, v3, cl1, cl2, cl3, ke0);
}

// ── eBIS: Hill equation (Eleveld PD component) ──────────

// Eleveld BJA 2018 PD parameters
const CE50 = 3.08;    // μg/ml — Ce producing 50% of max effect
const GAMMA = 1.47;   // Hill coefficient (steepness)
const BIS_0 = 93;     // Baseline BIS (awake, no drug)
const BIS_MAX = 93;   // Maximum BIS reduction

export function calculateEBIS(ce: number): number {
  if (ce <= 0) return BIS_0;
  // Hill equation: BIS = BIS_0 * (1 - sigmoid(Ce, CE50, gamma))
  const effect = sigmoid(ce, CE50, GAMMA);
  const bis = BIS_0 * (1 - effect);
  return Math.max(0, Math.min(100, Math.round(bis)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pharmacokinetics/eleveld-propofol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/pharmacokinetics/models/eleveld-propofol.ts tests/pharmacokinetics/eleveld-propofol.test.ts
git commit -m "feat(pk): implement Eleveld propofol model with eBIS calculation"
```

---

### Task 3: Minto Remifentanil Model

**Files:**
- Create: `client/src/lib/pharmacokinetics/models/minto-remifentanil.ts`
- Create: `tests/pharmacokinetics/minto-remifentanil.test.ts`

**Reference:** Minto CF et al. Anesthesiology 1997;86:10-23, Table 3.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/pharmacokinetics/minto-remifentanil.test.ts
import { describe, it, expect } from "vitest";
import { calculateMintoRemifentanil } from "../client/src/lib/pharmacokinetics/models/minto-remifentanil";
import type { PatientCovariates } from "../client/src/lib/pharmacokinetics/types";

describe("Minto Remifentanil Model", () => {
  const standardMale: PatientCovariates = { age: 40, weight: 70, height: 170, sex: "male" };
  const elderlyFemale: PatientCovariates = { age: 75, weight: 55, height: 160, sex: "female" };

  it("returns valid parameters for standard male", () => {
    const params = calculateMintoRemifentanil(standardMale);
    // V1 should be around 5-6L
    expect(params.v1).toBeGreaterThan(3);
    expect(params.v1).toBeLessThan(10);
    expect(params.v2).toBeGreaterThan(0);
    expect(params.v3).toBeGreaterThan(0);
    expect(params.cl1).toBeGreaterThan(0);
    expect(params.ke0).toBeGreaterThan(0);
    // Rate constants
    expect(params.k10).toBeCloseTo(params.cl1 / params.v1, 6);
  });

  it("reflects age-dependent changes", () => {
    const young = calculateMintoRemifentanil(standardMale);
    const old = calculateMintoRemifentanil({ ...standardMale, age: 80 });
    // V1 decreases with age in Minto model
    expect(old.v1).toBeLessThan(young.v1);
  });

  it("reflects sex-dependent LBM differences", () => {
    const male = calculateMintoRemifentanil(standardMale);
    const female = calculateMintoRemifentanil({ ...standardMale, sex: "female" });
    // Female LBM is lower → different volumes
    expect(male.v1).not.toBeCloseTo(female.v1, 1);
  });

  it("ke0 is higher than propofol (faster equilibration)", () => {
    const params = calculateMintoRemifentanil(standardMale);
    // Minto ke0 is typically ~0.5-0.6 min⁻¹ (faster than Eleveld propofol ~0.15)
    expect(params.ke0).toBeGreaterThan(0.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pharmacokinetics/minto-remifentanil.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Minto model**

```typescript
// client/src/lib/pharmacokinetics/models/minto-remifentanil.ts
//
// Minto CF et al. Anesthesiology 1997;86:10-23 — Table 3
// Three-compartment PK model for remifentanil
// Implemented from published parameter estimates.

import type { PatientCovariates, PKModelParameters } from "../types";
import { deriveRateConstants } from "../types";

// ── Lean Body Mass (James formula, as used in Minto) ────

function calculateLBM(weight: number, height: number, sex: "male" | "female"): number {
  const heightM = height / 100;
  if (sex === "male") {
    return 1.1 * weight - 128 * (weight / (height)) ** 2;
  } else {
    return 1.07 * weight - 148 * (weight / (height)) ** 2;
  }
}

// ── Minto parameter calculation ──────────────────────────

export function calculateMintoRemifentanil(patient: PatientCovariates): PKModelParameters {
  const { age, weight, height, sex } = patient;
  const lbm = calculateLBM(weight, height, sex);

  // Minto 1997, Table 3 — population parameters with covariates
  const v1 = 5.1 - 0.0201 * (age - 40) + 0.072 * (lbm - 55);
  const v2 = 9.82 - 0.0811 * (age - 40) + 0.108 * (lbm - 55);
  const v3 = 5.42;

  const cl1 = 2.6 - 0.0162 * (age - 40) + 0.0191 * (lbm - 55);
  const cl2 = 2.05 - 0.0301 * (age - 40);
  const cl3 = 0.076 - 0.00113 * (age - 40);

  const ke0 = 0.595 - 0.007 * (age - 40);

  // Ensure all values are positive (edge cases with extreme demographics)
  const safeV1 = Math.max(v1, 0.1);
  const safeV2 = Math.max(v2, 0.1);
  const safeV3 = Math.max(v3, 0.1);
  const safeCl1 = Math.max(cl1, 0.01);
  const safeCl2 = Math.max(cl2, 0.01);
  const safeCl3 = Math.max(cl3, 0.001);
  const safeKe0 = Math.max(ke0, 0.01);

  return deriveRateConstants(safeV1, safeV2, safeV3, safeCl1, safeCl2, safeCl3, safeKe0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pharmacokinetics/minto-remifentanil.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/pharmacokinetics/models/minto-remifentanil.ts tests/pharmacokinetics/minto-remifentanil.test.ts
git commit -m "feat(pk): implement Minto remifentanil model"
```

---

### Task 4: Three-Compartment Analytical Solver

**Files:**
- Create: `client/src/lib/pharmacokinetics/engine.ts`
- Create: `tests/pharmacokinetics/engine.test.ts`

The solver takes rate constants and a piecewise-constant infusion rate schedule, and computes compartment concentrations at each time step using the analytical solution.

- [ ] **Step 1: Write failing tests for the solver**

```typescript
// tests/pharmacokinetics/engine.test.ts
import { describe, it, expect } from "vitest";
import {
  initSolverState,
  advanceState,
  computeCp,
  computeCe,
  INITIAL_EIGEN_STATE,
} from "../client/src/lib/pharmacokinetics/engine";
import type { PKModelParameters } from "../client/src/lib/pharmacokinetics/types";

// Simple test model with known parameters
const testModel: PKModelParameters = {
  v1: 5, v2: 20, v3: 200,
  cl1: 1, cl2: 1.5, cl3: 0.5,
  ke0: 0.5,
  k10: 0.2, k12: 0.3, k21: 0.075, k13: 0.1, k31: 0.0025,
};

describe("Three-Compartment Solver", () => {
  describe("initSolverState", () => {
    it("precomputes eigenvalues and coefficients from model parameters", () => {
      const solver = initSolverState(testModel);
      expect(solver.lambdas).toHaveLength(3);
      // All eigenvalues should be positive (decay rates)
      solver.lambdas.forEach(l => expect(l).toBeGreaterThan(0));
      // Plasma coefficients should sum to 1 (unit impulse normalization)
      const coeffSum = solver.pCoeffs[0] + solver.pCoeffs[1] + solver.pCoeffs[2];
      expect(coeffSum).toBeCloseTo(1, 4);
    });
  });

  describe("advanceState", () => {
    it("maintains zero state with zero infusion rate", () => {
      const solver = initSolverState(testModel);
      const state = advanceState(solver, INITIAL_EIGEN_STATE, 0, 10);
      expect(computeCp(state)).toBeCloseTo(0, 8);
      expect(computeCe(state)).toBeCloseTo(0, 8);
    });

    it("increases plasma concentration with positive infusion", () => {
      const solver = initSolverState(testModel);
      const state = advanceState(solver, INITIAL_EIGEN_STATE, 100, 10);
      expect(computeCp(state)).toBeGreaterThan(0);
    });

    it("concentration decays after infusion stops", () => {
      const solver = initSolverState(testModel);
      const during = advanceState(solver, INITIAL_EIGEN_STATE, 100, 60);
      const after = advanceState(solver, during, 0, 60);
      expect(computeCp(after)).toBeLessThan(computeCp(during));
    });

    it("effect-site concentration lags behind plasma", () => {
      const solver = initSolverState(testModel);
      const state = advanceState(solver, INITIAL_EIGEN_STATE, 100, 10);
      expect(computeCp(state)).toBeGreaterThan(computeCe(state));
    });

    it("effect-site eventually approaches plasma at steady state", () => {
      const solver = initSolverState(testModel);
      let state = INITIAL_EIGEN_STATE;
      for (let i = 0; i < 100; i++) {
        state = advanceState(solver, state, 100, 60);
      }
      const cp = computeCp(state);
      const ce = computeCe(state);
      expect(Math.abs(cp - ce) / cp).toBeLessThan(0.1);
    });

    it("is numerically stable over long simulations (8+ hours)", () => {
      const solver = initSolverState(testModel);
      let state = INITIAL_EIGEN_STATE;
      // 8 hours at 10s intervals = 2880 steps
      for (let i = 0; i < 2880; i++) {
        state = advanceState(solver, state, 50, 10);
      }
      const cp = computeCp(state);
      expect(cp).toBeGreaterThan(0);
      expect(Number.isFinite(cp)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pharmacokinetics/engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the analytical solver**

```typescript
// client/src/lib/pharmacokinetics/engine.ts
//
// Three-compartment pharmacokinetic model solver.
// Uses analytical solution with pre-computed eigenvalues.
// Implemented from standard PK mathematics (see Shafer & Gregg, J Pharmacokinet Biopharm 1992).

import type { PKModelParameters } from "./types";

// ── Solver State ─────────────────────────────────────────
// The solver tracks state per-eigenvalue component, NOT per-compartment.
// This is the standard STANPUMP approach: decompose into eigenvalue basis,
// advance each independently, then reconstruct concentrations.

export interface EigenState {
  // Per-eigenvalue plasma components (3 values)
  p: [number, number, number];
  // Per-eigenvalue effect-site components (4 values: 3 plasma + 1 effect)
  e: [number, number, number, number];
}

export interface SolverState {
  model: PKModelParameters;
  lambdas: [number, number, number];
  // Coefficients for unit impulse response: coeff_i for each eigenvalue
  pCoeffs: [number, number, number];
  // Effect-site coefficients
  eCoeffs: [number, number, number, number];
  eLambdas: [number, number, number, number]; // includes ke0 as 4th
}

export const INITIAL_EIGEN_STATE: EigenState = {
  p: [0, 0, 0],
  e: [0, 0, 0, 0],
};

// ── Eigenvalue computation ───────────────────────────────
// 3-compartment model → cubic characteristic polynomial:
// λ³ - aλ² + bλ - c = 0

function solveCubicRoots(
  k10: number, k12: number, k21: number, k13: number, k31: number
): [number, number, number] {
  const a = k10 + k12 + k21 + k13 + k31;
  const b = k10 * k21 + k10 * k31 + k12 * k31 + k21 * k13 + k21 * k31;
  const c = k10 * k21 * k31;

  // Trigonometric solution for 3 real positive roots
  const p = b - (a * a) / 3;
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const r = Math.sqrt(-(p * p * p) / 27);
  const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
  const m = 2 * Math.cbrt(r);
  const offset = a / 3;

  const roots = [
    -(m * Math.cos(phi / 3) - offset),
    -(m * Math.cos((phi + 2 * Math.PI) / 3) - offset),
    -(m * Math.cos((phi + 4 * Math.PI) / 3) - offset),
  ].sort((a, b) => a - b) as [number, number, number]; // ascending

  return roots;
}

// ── Plasma unit disposition function coefficients ────────
// For a unit bolus into V1, the plasma concentration follows:
// Cp(t) = Σ A_i * exp(-λ_i * t) / V1
// where A_i = (k21 - λ_i)(k31 - λ_i) / Π(λ_j - λ_i) for j≠i

function computePlasmaCoeffs(
  lambdas: [number, number, number],
  k21: number, k31: number,
): [number, number, number] {
  const coeffs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const li = lambdas[i];
    const num = (k21 - li) * (k31 - li);
    let denom = 1;
    for (let j = 0; j < 3; j++) {
      if (j !== i) denom *= (lambdas[j] - li);
    }
    coeffs.push(num / denom);
  }
  return coeffs as [number, number, number];
}

// ── Effect-site coefficients ─────────────────────────────
// Ce(t) = Σ B_i * exp(-λ_i * t)  (4 terms: 3 plasma eigenvalues + ke0)

function computeEffectCoeffs(
  lambdas: [number, number, number],
  pCoeffs: [number, number, number],
  ke0: number,
): { eCoeffs: [number, number, number, number]; eLambdas: [number, number, number, number] } {
  const eLambdas: [number, number, number, number] = [lambdas[0], lambdas[1], lambdas[2], ke0];
  const eCoeffs: number[] = [];

  // For each plasma eigenvalue: B_i = ke0 * A_i / (ke0 - λ_i)
  for (let i = 0; i < 3; i++) {
    eCoeffs.push((ke0 * pCoeffs[i]) / (ke0 - lambdas[i]));
  }
  // 4th term ensures Ce(0) = 0: B_4 = -(B_1 + B_2 + B_3)
  eCoeffs.push(-(eCoeffs[0] + eCoeffs[1] + eCoeffs[2]));

  return { eCoeffs: eCoeffs as [number, number, number, number], eLambdas };
}

// ── Initialize solver ────────────────────────────────────

export function initSolverState(model: PKModelParameters): SolverState {
  const { k10, k12, k21, k13, k31, ke0 } = model;
  const lambdas = solveCubicRoots(k10, k12, k21, k13, k31);
  const pCoeffs = computePlasmaCoeffs(lambdas, k21, k31);
  const { eCoeffs, eLambdas } = computeEffectCoeffs(lambdas, pCoeffs, ke0);
  return { model, lambdas, pCoeffs, eCoeffs, eLambdas };
}

// ── Advance state by dt seconds at constant rate ─────────
// rate is in mass/min (μg/min for propofol, ng/min for remi)
//
// Each eigenvalue component evolves independently:
//   p_i(t+dt) = p_i(t) * exp(-λ_i * dt) + (rate/V1) * A_i * (1 - exp(-λ_i * dt)) / λ_i
// Then: Cp = Σ p_i

export function advanceState(
  solver: SolverState,
  state: EigenState,
  rate: number,
  dtSeconds: number,
): EigenState {
  const { lambdas, pCoeffs, eCoeffs, eLambdas, model } = solver;
  const dt = dtSeconds / 60; // convert to minutes
  const rateOverV1 = rate / model.v1;

  // Advance plasma eigenvalue components
  const newP: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const decay = Math.exp(-lambdas[i] * dt);
    newP[i] = state.p[i] * decay + rateOverV1 * pCoeffs[i] * (1 - decay) / lambdas[i];
  }

  // Advance effect-site eigenvalue components
  const newE: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const decay = Math.exp(-eLambdas[i] * dt);
    newE[i] = state.e[i] * decay + rateOverV1 * eCoeffs[i] * (1 - decay) / eLambdas[i];
  }

  return { p: newP, e: newE };
}

// ── Concentration from eigenvalue state ──────────────────

export function computeCp(state: EigenState): number {
  return Math.max(0, state.p[0] + state.p[1] + state.p[2]);
}

export function computeCe(state: EigenState): number {
  return Math.max(0, state.e[0] + state.e[1] + state.e[2] + state.e[3]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pharmacokinetics/engine.test.ts`
Expected: PASS — adjust implementation if numerical tests fail; the key behaviors to verify are: zero input → zero output, infusion increases concentration, stopping infusion → decay, Ce lags Cp.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/pharmacokinetics/engine.ts tests/pharmacokinetics/engine.test.ts
git commit -m "feat(pk): implement 3-compartment analytical solver"
```

---

### Task 5: TCI Controller

**Files:**
- Create: `client/src/lib/pharmacokinetics/tci-controller.ts`
- Create: `tests/pharmacokinetics/tci-controller.test.ts`

The TCI controller simulates what a TCI pump does: given target concentrations, it computes the infusion rates needed at each time step.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/pharmacokinetics/tci-controller.test.ts
import { describe, it, expect } from "vitest";
import { computeTCIRates } from "../client/src/lib/pharmacokinetics/tci-controller";
import { calculateEleveldPropofol } from "../client/src/lib/pharmacokinetics/models/eleveld-propofol";
import type { TargetEvent } from "../client/src/lib/pharmacokinetics/types";
import { CPT_INTERVAL_S } from "../client/src/lib/pharmacokinetics/types";

describe("TCI Controller", () => {
  const model = calculateEleveldPropofol({ age: 40, weight: 70, height: 170, sex: "male" });
  const t0 = 0;

  it("produces high initial rate (bolus) to reach target", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 5 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    // First few steps should have high rate (bolus phase)
    expect(rates[0].rate).toBeGreaterThan(rates[rates.length - 1].rate);
  });

  it("reaches target concentration within 2 minutes", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 5 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    // Check that the achieved Cp is close to target after some steps
    // (The rates output includes computed Cp for validation)
    const lastRate = rates[rates.length - 1];
    expect(lastRate.achievedCp).toBeGreaterThan(3.5);
    expect(lastRate.achievedCp).toBeLessThan(4.5);
  });

  it("reduces rate when target is lowered", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
      { type: "rate_change", timestamp: t0 + 5 * 60 * 1000, targetConcentration: 2.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 10 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    // After target drop, rate should go to 0 (let concentration decay)
    const afterChange = rates.find(r => r.timestamp > t0 + 5 * 60 * 1000);
    expect(afterChange!.rate).toBe(0); // Decay phase — no infusion
  });

  it("stops infusion completely on stop event", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
      { type: "stop", timestamp: t0 + 5 * 60 * 1000, targetConcentration: 0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 10 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    const afterStop = rates.filter(r => r.timestamp > t0 + 5 * 60 * 1000);
    afterStop.forEach(r => expect(r.rate).toBe(0));
  });

  it("never produces negative infusion rates", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 6.0 },
      { type: "rate_change", timestamp: t0 + 2 * 60 * 1000, targetConcentration: 1.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 10 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    rates.forEach(r => expect(r.rate).toBeGreaterThanOrEqual(0));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pharmacokinetics/tci-controller.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement TCI controller**

```typescript
// client/src/lib/pharmacokinetics/tci-controller.ts
//
// TCI (Target-Controlled Infusion) controller.
// Simulates what a TCI pump does: given target Cp, computes the infusion rate
// at each time step that will achieve/maintain that target.
//
// Algorithm: At each step, use the unit disposition function (UDF) to calculate
// the rate needed to reach the target Cp by the next step.

import type { PKModelParameters, TargetEvent } from "./types";
import { CPT_INTERVAL_S } from "./types";
import { initSolverState, advanceState, computeCp, computeCe, INITIAL_EIGEN_STATE, type EigenState } from "./engine";

export interface TCIRatePoint {
  timestamp: number;   // ms
  rate: number;        // mass/min (μg/min or ng/min)
  achievedCp: number;  // predicted Cp at this time point
  achievedCe: number;  // predicted Ce at this time point
}

/**
 * Compute infusion rates to achieve target concentrations.
 *
 * @param model - PK model parameters for this patient
 * @param targets - Target events (start, rate_change, stop) with target concentrations
 * @param timeRange - Start and end time in ms
 * @param intervalMs - Time step in ms (default: CPT_INTERVAL_S * 1000)
 * @returns Array of rate points with achieved concentrations
 */
export function computeTCIRates(
  model: PKModelParameters,
  targets: TargetEvent[],
  timeRange: { start: number; end: number },
  intervalMs: number = CPT_INTERVAL_S * 1000,
): TCIRatePoint[] {
  const solver = initSolverState(model);
  const dtSeconds = intervalMs / 1000;
  const results: TCIRatePoint[] = [];

  // Sort targets by timestamp
  const sortedTargets = [...targets].sort((a, b) => a.timestamp - b.timestamp);

  let state: EigenState = { ...INITIAL_EIGEN_STATE, p: [0, 0, 0], e: [0, 0, 0, 0] };
  let currentTarget = 0;
  let targetIdx = 0;
  let isStopped = true;

  for (let t = timeRange.start; t <= timeRange.end; t += intervalMs) {
    // Update target if we've passed the next target event
    while (targetIdx < sortedTargets.length && sortedTargets[targetIdx].timestamp <= t) {
      const event = sortedTargets[targetIdx];
      if (event.type === "stop") {
        currentTarget = 0;
        isStopped = true;
      } else {
        currentTarget = event.targetConcentration;
        isStopped = false;
      }
      targetIdx++;
    }

    let rate = 0;
    if (!isStopped && currentTarget > 0) {
      const currentCp = computeCp(state);

      if (currentCp < currentTarget) {
        // UDF approach: predict Cp with unit rate vs zero rate,
        // then scale linearly to reach target
        const testState = advanceState(solver, state, 1.0, dtSeconds);
        const testCp = computeCp(testState);
        const zeroState = advanceState(solver, state, 0, dtSeconds);
        const zeroCp = computeCp(zeroState);

        const deltaPerUnit = testCp - zeroCp;
        if (deltaPerUnit > 0) {
          rate = Math.max(0, (currentTarget - zeroCp) / deltaPerUnit);
        }
      }
      // If currentCp >= target, rate = 0 (let it decay toward target)
    }

    // Advance state with computed rate
    state = advanceState(solver, state, rate, dtSeconds);

    results.push({
      timestamp: t,
      rate,
      achievedCp: computeCp(state),
      achievedCe: computeCe(state),
    });
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pharmacokinetics/tci-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/pharmacokinetics/tci-controller.ts tests/pharmacokinetics/tci-controller.test.ts
git commit -m "feat(pk): implement TCI controller for target-to-rate conversion"
```

---

### Task 6: Simulation Orchestrator + Barrel Export

**Files:**
- Create: `client/src/lib/pharmacokinetics/simulate.ts`
- Create: `client/src/lib/pharmacokinetics/index.ts`
- Create: `tests/pharmacokinetics/simulate.test.ts`

- [ ] **Step 1: Write failing end-to-end tests**

```typescript
// tests/pharmacokinetics/simulate.test.ts
import { describe, it, expect } from "vitest";
import { simulate } from "../client/src/lib/pharmacokinetics/simulate";
import type { PatientCovariates, TargetEvent } from "../client/src/lib/pharmacokinetics/types";

describe("simulate", () => {
  const patient: PatientCovariates = { age: 40, weight: 70, height: 170, sex: "male" };
  const t0 = 0;

  it("produces time points with propofol predictions only", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 5 * 60 * 1000 });
    expect(result.length).toBeGreaterThan(0);
    // Should have propofol data
    const last = result[result.length - 1];
    expect(last.propofolCp).not.toBeNull();
    expect(last.propofolCe).not.toBeNull();
    // Should have eBIS
    expect(last.eBIS).not.toBeNull();
    expect(last.eBIS!).toBeGreaterThan(0);
    expect(last.eBIS!).toBeLessThanOrEqual(100);
    // Remi should be null
    expect(last.remiCp).toBeNull();
    expect(last.remiCe).toBeNull();
  });

  it("produces time points with both propofol and remi", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const remiTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const result = simulate(patient, propofolTargets, remiTargets, { start: t0, end: t0 + 5 * 60 * 1000 });
    const last = result[result.length - 1];
    expect(last.propofolCp).not.toBeNull();
    expect(last.remiCp).not.toBeNull();
    expect(last.eBIS).not.toBeNull();
  });

  it("propofol Cp reaches near target after 5 minutes", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 5 * 60 * 1000 });
    const last = result[result.length - 1];
    // Should be within 20% of target after 5 min
    expect(last.propofolCp!).toBeGreaterThan(3.2);
    expect(last.propofolCp!).toBeLessThan(4.8);
  });

  it("handles target change mid-case", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
      { type: "rate_change", timestamp: t0 + 5 * 60 * 1000, targetConcentration: 3.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 15 * 60 * 1000 });
    const last = result[result.length - 1];
    // Should converge toward new target (3.0)
    expect(last.propofolCp!).toBeGreaterThan(2.4);
    expect(last.propofolCp!).toBeLessThan(3.6);
  });

  it("returns empty array when no targets", () => {
    const result = simulate(patient, [], [], { start: t0, end: t0 + 5 * 60 * 1000 });
    // Still returns time points but all nulls
    result.forEach(pt => {
      expect(pt.propofolCp).toBeNull();
      expect(pt.remiCp).toBeNull();
      expect(pt.eBIS).toBeNull();
    });
  });

  it("eBIS decreases as propofol Ce increases", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 5.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 10 * 60 * 1000 });
    // Early: high eBIS (awake). Late: low eBIS (anaesthetised)
    const early = result[2]; // ~20s in
    const late = result[result.length - 1];
    expect(early.eBIS!).toBeGreaterThan(late.eBIS!);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pharmacokinetics/simulate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement simulate.ts and index.ts**

```typescript
// client/src/lib/pharmacokinetics/simulate.ts

import type { PatientCovariates, TargetEvent, PKTimePoint } from "./types";
import { CPT_INTERVAL_S } from "./types";
import { calculateEleveldPropofol, calculateEBIS } from "./models/eleveld-propofol";
import { calculateMintoRemifentanil } from "./models/minto-remifentanil";
import { computeTCIRates } from "./tci-controller";

/**
 * Run the full PK simulation for a TIVA case.
 *
 * @param patient - Patient covariates (age, weight, height, sex)
 * @param propofolTargets - Propofol TCI target events
 * @param remiTargets - Remifentanil TCI target events
 * @param timeRange - Start/end timestamps in ms
 * @returns Array of PKTimePoint with Cp/Ce/eBIS at each interval
 */
export function simulate(
  patient: PatientCovariates,
  propofolTargets: TargetEvent[],
  remiTargets: TargetEvent[],
  timeRange: { start: number; end: number },
): PKTimePoint[] {
  const intervalMs = CPT_INTERVAL_S * 1000;

  const hasPropofol = propofolTargets.length > 0;
  const hasRemi = remiTargets.length > 0;

  // Calculate model parameters for each drug
  let propofolRates: ReturnType<typeof computeTCIRates> = [];
  let remiRates: ReturnType<typeof computeTCIRates> = [];

  if (hasPropofol) {
    const propofolModel = calculateEleveldPropofol(patient);
    propofolRates = computeTCIRates(propofolModel, propofolTargets, timeRange, intervalMs);
  }

  if (hasRemi) {
    const remiModel = calculateMintoRemifentanil(patient);
    remiRates = computeTCIRates(remiModel, remiTargets, timeRange, intervalMs);
  }

  // Build unified time series
  const points: PKTimePoint[] = [];
  const numSteps = Math.floor((timeRange.end - timeRange.start) / intervalMs) + 1;

  for (let i = 0; i < numSteps; i++) {
    const timestamp = timeRange.start + i * intervalMs;
    const propPt = hasPropofol && i < propofolRates.length ? propofolRates[i] : null;
    const remiPt = hasRemi && i < remiRates.length ? remiRates[i] : null;

    const propofolCe = propPt?.achievedCe ?? null;
    const eBIS = propofolCe !== null ? calculateEBIS(propofolCe) : null;

    points.push({
      timestamp,
      propofolCp: propPt?.achievedCp ?? null,
      propofolCe,
      remiCp: remiPt?.achievedCp ?? null,
      remiCe: remiPt?.achievedCe ?? null,
      eBIS,
    });
  }

  return points;
}
```

```typescript
// client/src/lib/pharmacokinetics/index.ts

export { simulate } from "./simulate";
export { calculateEBIS } from "./models/eleveld-propofol";
export { parsePatientCovariates, validateCovariates } from "./types";
export type {
  PatientCovariates,
  TargetEvent,
  PKTimePoint,
  ParseResult,
  CovariateValidation,
} from "./types";
```

- [ ] **Step 4: Run ALL PK engine tests**

Run: `npx vitest run tests/pharmacokinetics/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/pharmacokinetics/simulate.ts client/src/lib/pharmacokinetics/index.ts tests/pharmacokinetics/simulate.test.ts
git commit -m "feat(pk): add simulation orchestrator and barrel exports"
```

---

## Chunk 2: React Integration

### Task 7: usePKSimulation Hook

**Files:**
- Create: `client/src/hooks/usePKSimulation.ts`

This hook connects the PK engine to the anesthesia record UI. It auto-detects TCI medications, extracts patient covariates, runs the simulation, and provides real-time predictions.

- [ ] **Step 1: Implement the hook**

```typescript
// client/src/hooks/usePKSimulation.ts

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { simulate, parsePatientCovariates } from "@/lib/pharmacokinetics";
import type { PKTimePoint, TargetEvent } from "@/lib/pharmacokinetics";
import type { RateInfusionSession } from "@/hooks/useMedicationState";

// ── Constants ────────────────────────────────────────────

const TICK_INTERVAL_MS = 120_000; // 2 minutes
const DISMISS_KEY_PREFIX = "pk-dismiss-";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Types ────────────────────────────────────────────────

export interface PKSimulationResult {
  pkTimeSeries: PKTimePoint[];
  currentValues: {
    propofolCp: number | null;
    propofolCe: number | null;
    remiCp: number | null;
    remiCe: number | null;
    eBIS: number | null;
  } | null;
  isActive: boolean;
  isDismissed: boolean;
  missingFields: string[];
  sexDefaultApplied: boolean;
  dismiss: () => void;
  restore: () => void;
}

// ── Helpers ──────────────────────────────────────────────

function extractTCITargets(
  sessions: RateInfusionSession[],
  caseStartTime: number,
): TargetEvent[] {
  const events: TargetEvent[] = [];

  for (const session of sessions) {
    if (!session.startTime) continue;

    // Start event
    const startConc = parseFloat(session.startDose);
    if (!isNaN(startConc) && startConc > 0) {
      events.push({
        type: "start",
        timestamp: session.startTime,
        targetConcentration: startConc,
      });
    }

    // Rate change segments (skip first — it's the start)
    for (let i = 1; i < session.segments.length; i++) {
      const seg = session.segments[i];
      const conc = parseFloat(seg.rate);
      if (!isNaN(conc) && conc > 0) {
        events.push({
          type: "rate_change",
          timestamp: seg.startTime,
          targetConcentration: conc,
        });
      }
    }

    // Stop event
    if (session.endTime && session.state === "stopped") {
      events.push({
        type: "stop",
        timestamp: session.endTime,
        targetConcentration: 0,
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

function cleanupDismissKeys(): void {
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DISMISS_KEY_PREFIX)) {
      try {
        const ts = parseInt(localStorage.getItem(key) || "0", 10);
        if (now - ts > DISMISS_TTL_MS) {
          localStorage.removeItem(key);
        }
      } catch { /* ignore */ }
    }
  }
}

// ── Hook ─────────────────────────────────────────────────

export function usePKSimulation(
  patientData: { birthday?: string | null; sex?: string | null } | null,
  anesthesiaRecord: { weight?: string | null; height?: string | null } | null,
  rateInfusionSessions: Record<string, RateInfusionSession[]>,
  swimlaneRateUnits: Record<string, string | null | undefined>,
  caseId: string | null,
  caseStartTime: number,
): PKSimulationResult {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (!caseId) return false;
    return localStorage.getItem(`${DISMISS_KEY_PREFIX}${caseId}`) !== null;
  });

  // Cleanup old dismiss keys on mount
  useEffect(() => { cleanupDismissKeys(); }, []);

  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  // Parse patient covariates
  const parsed = useMemo(() => {
    if (!patientData || !anesthesiaRecord) {
      return { covariates: null, missingFields: ["age", "weight", "height"], sexDefaultApplied: false };
    }
    return parsePatientCovariates({
      birthday: patientData.birthday ?? null,
      sex: patientData.sex ?? null,
      weight: anesthesiaRecord.weight ?? null,
      height: anesthesiaRecord.height ?? null,
    });
  }, [patientData?.birthday, patientData?.sex, anesthesiaRecord?.weight, anesthesiaRecord?.height]);

  // Find TCI sessions
  const tciSessions = useMemo(() => {
    const propofol: RateInfusionSession[] = [];
    const remi: RateInfusionSession[] = [];

    for (const [swimlaneId, sessions] of Object.entries(rateInfusionSessions)) {
      const rateUnit = swimlaneRateUnits[swimlaneId];
      if (rateUnit !== "TCI") continue;

      for (const session of sessions) {
        // Identify drug by swimlane label (heuristic — look for propofol/remi in name)
        const label = session.label.toLowerCase();
        if (label.includes("propofol")) {
          propofol.push(session);
        } else if (label.includes("remifentanil") || label.includes("remi")) {
          remi.push(session);
        }
      }
    }

    return { propofol, remi };
  }, [rateInfusionSessions, swimlaneRateUnits]);

  const isActive = tciSessions.propofol.length > 0 || tciSessions.remi.length > 0;

  // Extract target events
  const propofolTargets = useMemo(
    () => extractTCITargets(tciSessions.propofol, caseStartTime),
    [tciSessions.propofol, caseStartTime],
  );
  const remiTargets = useMemo(
    () => extractTCITargets(tciSessions.remi, caseStartTime),
    [tciSessions.remi, caseStartTime],
  );

  // Background tick for Ce equilibration
  useEffect(() => {
    if (!isActive || isDismissed) return;
    const interval = setInterval(() => {
      tickRef.current++;
      setTick(tickRef.current);
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActive, isDismissed]);

  // Run simulation
  const pkTimeSeries = useMemo(() => {
    if (!isActive || !parsed.covariates) return [];
    if (propofolTargets.length === 0 && remiTargets.length === 0) return [];

    const now = Date.now();
    return simulate(parsed.covariates, propofolTargets, remiTargets, {
      start: caseStartTime,
      end: now,
    });
  }, [parsed.covariates, propofolTargets, remiTargets, caseStartTime, isActive, tick]);

  // Current values (last point in series)
  const currentValues = useMemo(() => {
    if (pkTimeSeries.length === 0) return null;
    const last = pkTimeSeries[pkTimeSeries.length - 1];
    return {
      propofolCp: last.propofolCp,
      propofolCe: last.propofolCe,
      remiCp: last.remiCp,
      remiCe: last.remiCe,
      eBIS: last.eBIS,
    };
  }, [pkTimeSeries]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (caseId) {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${caseId}`, String(Date.now()));
    }
  }, [caseId]);

  const restore = useCallback(() => {
    setIsDismissed(false);
    if (caseId) {
      localStorage.removeItem(`${DISMISS_KEY_PREFIX}${caseId}`);
    }
  }, [caseId]);

  return {
    pkTimeSeries,
    currentValues,
    isActive,
    isDismissed,
    missingFields: parsed.missingFields,
    sexDefaultApplied: parsed.sexDefaultApplied,
    dismiss,
    restore,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit client/src/hooks/usePKSimulation.ts` or `npm run check`
Expected: No type errors (may need to adjust imports based on actual module resolution)

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/usePKSimulation.ts
git commit -m "feat(pk): add usePKSimulation React hook with auto-detection and dismiss"
```

---

### Task 7b: Hook Unit Tests

**Files:**
- Create: `tests/pharmacokinetics/hook-helpers.test.ts`

The hook itself is hard to unit test (React hooks), but its helper functions (TCI target extraction, drug identification) can be tested directly. Extract these as standalone functions.

- [ ] **Step 1: Write tests for extractTCITargets and drug identification**

```typescript
// tests/pharmacokinetics/hook-helpers.test.ts
import { describe, it, expect } from "vitest";
import { extractTCITargets, identifyTCIDrug } from "../client/src/hooks/usePKSimulation";

describe("extractTCITargets", () => {
  it("extracts start event from infusion session", () => {
    const sessions = [{
      id: "s1", swimlaneId: "lane1", label: "Propofol 1%",
      syringeQuantity: "1", startDose: "4.0", segments: [{ startTime: 1000, rate: "4.0", rateUnit: "TCI" }],
      state: "running" as const, startTime: 1000,
    }];
    const targets = extractTCITargets(sessions, 0);
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe("start");
    expect(targets[0].targetConcentration).toBe(4.0);
  });

  it("extracts rate change events from segments", () => {
    const sessions = [{
      id: "s1", swimlaneId: "lane1", label: "Propofol",
      syringeQuantity: "1", startDose: "4.0",
      segments: [
        { startTime: 1000, rate: "4.0", rateUnit: "TCI" },
        { startTime: 5000, rate: "3.0", rateUnit: "TCI" },
      ],
      state: "running" as const, startTime: 1000,
    }];
    const targets = extractTCITargets(sessions, 0);
    expect(targets).toHaveLength(2);
    expect(targets[1].type).toBe("rate_change");
    expect(targets[1].targetConcentration).toBe(3.0);
  });

  it("extracts stop event", () => {
    const sessions = [{
      id: "s1", swimlaneId: "lane1", label: "Propofol",
      syringeQuantity: "1", startDose: "4.0",
      segments: [{ startTime: 1000, rate: "4.0", rateUnit: "TCI" }],
      state: "stopped" as const, startTime: 1000, endTime: 10000,
    }];
    const targets = extractTCITargets(sessions, 0);
    expect(targets).toHaveLength(2);
    expect(targets[1].type).toBe("stop");
  });
});

describe("identifyTCIDrug", () => {
  it("identifies propofol by name", () => {
    expect(identifyTCIDrug("Propofol 1%")).toBe("propofol");
    expect(identifyTCIDrug("propofol")).toBe("propofol");
  });

  it("identifies propofol by brand name (Diprivan)", () => {
    expect(identifyTCIDrug("Diprivan")).toBe("propofol");
  });

  it("identifies remifentanil by name", () => {
    expect(identifyTCIDrug("Remifentanil")).toBe("remifentanil");
    expect(identifyTCIDrug("Remi 2mg")).toBe("remifentanil");
  });

  it("identifies remifentanil by brand name (Ultiva)", () => {
    expect(identifyTCIDrug("Ultiva")).toBe("remifentanil");
  });

  it("returns null for unknown drugs", () => {
    expect(identifyTCIDrug("Rocuronium")).toBeNull();
  });
});
```

- [ ] **Step 2: Export helper functions from usePKSimulation.ts**

Make `extractTCITargets` and `identifyTCIDrug` exported functions. Update the drug identification logic to handle German names and brand names:

```typescript
// In usePKSimulation.ts — replace string matching with robust identification

const PROPOFOL_NAMES = ["propofol", "diprivan"];
const REMI_NAMES = ["remifentanil", "remi", "ultiva"];

export function identifyTCIDrug(label: string): "propofol" | "remifentanil" | null {
  const lower = label.toLowerCase();
  if (PROPOFOL_NAMES.some(name => lower.includes(name))) return "propofol";
  if (REMI_NAMES.some(name => lower.includes(name))) return "remifentanil";
  return null;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/pharmacokinetics/hook-helpers.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/pharmacokinetics/hook-helpers.test.ts client/src/hooks/usePKSimulation.ts
git commit -m "test(pk): add tests for TCI target extraction and drug identification"
```

---

### Task 8: Swimlane Reordering

**Files:**
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx` (lines 1748-1882)

Move the "Others" swimlane from last position to after "Events", and rename its displayed label to "Monitoring".

- [ ] **Step 1: Move "others" in baseSwimlanes array**

In `UnifiedTimeline.tsx`, change the `baseSwimlanes` array (lines 1748-1764).

Current order: zeiten, ereignisse, [tof|vas/scores], herzrhythmus, position, ventilation, output, others

New order: zeiten, ereignisse, **others** (label → "Monitoring"), [tof|vas/scores], herzrhythmus, position, ventilation, output

Move the `others` entry from line 1763 to after line 1750 (after `ereignisse`). Change only the label to use `t("anesthesia.timeline.monitoring", "Monitoring")` — keep `id: "others"` unchanged.

```typescript
// The baseSwimlanes array should become:
const baseSwimlanes: SwimlaneConfig[] = [
  { id: "zeiten", label: t("anesthesia.timeline.times"), height: 50, colorLight: "rgba(243, 232, 255, 0.8)", colorDark: "hsl(270, 55%, 20%)" },
  { id: "ereignisse", label: t("anesthesia.timeline.events"), height: 48, colorLight: "rgba(219, 234, 254, 0.8)", colorDark: "hsl(210, 60%, 18%)" },
  // Monitoring (was "Others") — moved up for BIS + PK visibility
  { id: "others", label: t("anesthesia.timeline.monitoring", "Monitoring"), height: 48, colorLight: "rgba(233, 213, 255, 0.8)", colorDark: "hsl(280, 55%, 22%)" },
  // Conditionally show TOF (OR mode) or VAS/Scores (PACU mode)
  ...(isPacuMode ? [
    { id: "vas", label: "VAS", height: 38, colorLight: "rgba(254, 215, 215, 0.8)", colorDark: "hsl(0, 55%, 22%)" },
    { id: "scores", label: t("anesthesia.timeline.scoresLabel", "Scores"), height: 38, colorLight: "rgba(187, 247, 208, 0.8)", colorDark: "hsl(150, 55%, 22%)" },
  ] : [
    { id: "tof", label: "TOF", height: 38, colorLight: "rgba(233, 213, 255, 0.8)", colorDark: "hsl(280, 55%, 22%)" },
  ]),
  { id: "herzrhythmus", label: t("anesthesia.timeline.heartRhythm.label"), height: 48, colorLight: "rgba(252, 231, 243, 0.8)", colorDark: "hsl(330, 50%, 20%)" },
  { id: "position", label: t("anesthesia.timeline.position.label"), height: 48, colorLight: "rgba(226, 232, 240, 0.8)", colorDark: "hsl(215, 20%, 25%)" },
  { id: "ventilation", label: t("anesthesia.timeline.ventilation.label"), height: 48, colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" },
  { id: "output", label: t("anesthesia.timeline.output.label"), height: 48, colorLight: "rgba(254, 226, 226, 0.8)", colorDark: "hsl(0, 60%, 25%)" },
];
```

- [ ] **Step 2: Update the Medications insertion point**

In `buildActiveSwimlanes()` (line 1779), the Medications parent is inserted after TOF/Scores. Since "others" now comes before TOF, the insertion logic remains correct — it still inserts after `tof` or `scores`, which is now after "others". No change needed here.

- [ ] **Step 3: Update the "others" children insertion to include PK**

In `buildActiveSwimlanes()` (lines 1869-1882), the `othersParams` array currently only has `["BIS"]`. This is where the PK Predict swimlane will be added later (Task 10). For now, no change needed — just verify the reordering doesn't break anything.

- [ ] **Step 4: Add translation key**

Add `"monitoring": "Monitoring"` to the `anesthesia.timeline` namespace in the translation files. Check which translation file is used:

Run: `grep -r "anesthesia.timeline.others" client/src/` to find the current translation key usage. Add the new `monitoring` key alongside it.

- [ ] **Step 5: Verify the reordering works**

Run: `npm run check` — TypeScript must pass clean
Run: `npm run dev` — manually verify the timeline swimlane order in the browser

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/UnifiedTimeline.tsx
# Also add translation files if modified
git commit -m "feat(pk): reorder swimlanes — move Monitoring (BIS) after Events for visibility"
```

---

### Task 9: PKPredictionSwimlane Component

**Files:**
- Create: `client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx`

This component renders predicted Cp/Ce curves as SVG lines within the timeline, following the same positioning pattern as `BISSwimlane.tsx`.

- [ ] **Step 1: Create the swimlane component**

Study `BISSwimlane.tsx` (lines 8-150) for the positioning pattern:
- It uses `swimlanePositions` to find lane position (`top`, `height`)
- It calculates `xFraction = (timestamp - visibleStart) / visibleRange`
- It positions elements using `calc(200px + ${xFraction} * (100% - 210px))`
- It accesses timeline state via `useTimelineStore` (or equivalent context)

```typescript
// client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx

import { useMemo } from "react";
import type { PKTimePoint } from "@/lib/pharmacokinetics";

export interface PKPredictionSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  pkTimeSeries: PKTimePoint[];
  currentValues: {
    propofolCp: number | null;
    propofolCe: number | null;
    remiCp: number | null;
    remiCe: number | null;
    eBIS: number | null;
  } | null;
  visibleStart: number;
  visibleEnd: number;
  isDark: boolean;
  onDismiss: () => void;
}

// Color scheme matching medication swimlane colors
const COLORS = {
  propofolCp: "#2dd4bf",  // teal-400 (solid)
  propofolCe: "#14b8a6",  // teal-500 (dashed)
  remiCp: "#f472b6",      // pink-400 (solid)
  remiCe: "#ec4899",      // pink-500 (dashed)
};

export function PKPredictionSwimlane({
  swimlanePositions,
  pkTimeSeries,
  currentValues,
  visibleStart,
  visibleEnd,
  isDark,
  onDismiss,
}: PKPredictionSwimlaneProps) {
  const lane = swimlanePositions.find(l => l.id === "pk-prediction");
  if (!lane) return null;

  const visibleRange = visibleEnd - visibleStart;
  if (visibleRange <= 0) return null;

  // Filter points to visible range
  const visiblePoints = useMemo(
    () => pkTimeSeries.filter(pt => pt.timestamp >= visibleStart && pt.timestamp <= visibleEnd),
    [pkTimeSeries, visibleStart, visibleEnd],
  );

  // Convert time series to SVG path data
  const toSvgPoints = (
    points: PKTimePoint[],
    getValue: (pt: PKTimePoint) => number | null,
    maxConc: number,
  ): string => {
    const coords: string[] = [];
    for (const pt of points) {
      const val = getValue(pt);
      if (val === null) continue;
      const xFrac = (pt.timestamp - visibleStart) / visibleRange;
      const x = xFrac * 100; // percentage
      const yFrac = 1 - Math.min(val / maxConc, 1); // invert — higher concentration = higher on chart
      const y = yFrac * 100;
      coords.push(`${x},${y}`);
    }
    return coords.join(" ");
  };

  // Determine max concentration for Y-axis scaling
  const maxPropofol = useMemo(() => {
    let max = 6; // minimum scale
    for (const pt of visiblePoints) {
      if (pt.propofolCp !== null && pt.propofolCp > max) max = pt.propofolCp;
      if (pt.propofolCe !== null && pt.propofolCe > max) max = pt.propofolCe;
    }
    return max * 1.2; // 20% headroom
  }, [visiblePoints]);

  const maxRemi = useMemo(() => {
    let max = 6;
    for (const pt of visiblePoints) {
      if (pt.remiCp !== null && pt.remiCp > max) max = pt.remiCp;
      if (pt.remiCe !== null && pt.remiCe > max) max = pt.remiCe;
    }
    return max * 1.2;
  }, [visiblePoints]);

  const hasPropofol = currentValues?.propofolCp !== null;
  const hasRemi = currentValues?.remiCp !== null;

  return (
    <div
      style={{
        position: "absolute",
        top: `${lane.top}px`,
        left: "200px",
        right: "10px",
        height: `${lane.height}px`,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Propofol Cp (solid teal) */}
        {hasPropofol && (
          <polyline
            points={toSvgPoints(visiblePoints, pt => pt.propofolCp, maxPropofol)}
            stroke={COLORS.propofolCp}
            strokeWidth="0.8"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Propofol Ce (dashed teal) */}
        {hasPropofol && (
          <polyline
            points={toSvgPoints(visiblePoints, pt => pt.propofolCe, maxPropofol)}
            stroke={COLORS.propofolCe}
            strokeWidth="0.8"
            fill="none"
            strokeDasharray="3,2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Remi Cp (solid pink) */}
        {hasRemi && (
          <polyline
            points={toSvgPoints(visiblePoints, pt => pt.remiCp, maxRemi)}
            stroke={COLORS.remiCp}
            strokeWidth="0.8"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Remi Ce (dashed pink) */}
        {hasRemi && (
          <polyline
            points={toSvgPoints(visiblePoints, pt => pt.remiCe, maxRemi)}
            stroke={COLORS.remiCe}
            strokeWidth="0.8"
            fill="none"
            strokeDasharray="3,2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Current values label at right edge */}
      {currentValues && (
        <div
          style={{
            position: "absolute",
            right: "4px",
            top: "2px",
            fontSize: "9px",
            fontFamily: "monospace",
            lineHeight: "1.4",
            pointerEvents: "auto",
          }}
        >
          {hasPropofol && (
            <div>
              <span style={{ color: COLORS.propofolCp }}>
                Cp {currentValues.propofolCp?.toFixed(1)}
              </span>
              <span style={{ color: isDark ? "#4b5563" : "#9ca3af" }}> · </span>
              <span style={{ color: COLORS.propofolCe }}>
                Ce {currentValues.propofolCe?.toFixed(1)}
              </span>
              <span style={{ color: isDark ? "#6b7280" : "#9ca3af", fontSize: "8px" }}> μg/ml</span>
            </div>
          )}
          {hasRemi && (
            <div>
              <span style={{ color: COLORS.remiCp }}>
                Cp {currentValues.remiCp?.toFixed(1)}
              </span>
              <span style={{ color: isDark ? "#4b5563" : "#9ca3af" }}> · </span>
              <span style={{ color: COLORS.remiCe }}>
                Ce {currentValues.remiCe?.toFixed(1)}
              </span>
              <span style={{ color: isDark ? "#6b7280" : "#9ca3af", fontSize: "8px" }}> ng/ml</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx
git commit -m "feat(pk): add PKPredictionSwimlane component for Cp/Ce curve rendering"
```

---

### Task 10: Wire PK into UnifiedTimeline

**Files:**
- Modify: `client/src/components/anesthesia/UnifiedTimeline.tsx`

This task connects everything: the hook, the swimlane component, and the "others" children.

- [ ] **Step 1: Add imports**

At the top of `UnifiedTimeline.tsx`, add:

```typescript
import { usePKSimulation } from "@/hooks/usePKSimulation";
import { PKPredictionSwimlane } from "./swimlanes/PKPredictionSwimlane";
```

- [ ] **Step 2: Call usePKSimulation hook**

Inside the `UnifiedTimeline` component, after the existing hooks (around line 627), add:

```typescript
// PK Simulation for TIVA cases
const pkSimulation = usePKSimulation(
  patientData ?? null,           // { birthday, sex } — need to thread this prop
  anesthesiaRecord ?? null,      // { weight, height }
  rateInfusionSessions,          // from useMedicationState
  swimlaneRateUnits,             // Map of swimlaneId → rateUnit — need to derive this
  anesthesiaRecordId ?? null,    // case ID for dismiss persistence
  data.startTime,                // case start time
);
```

**Prop threading required:** The component already receives `patientWeight` and `anesthesiaRecord` as props but needs `patientData` (with `birthday` and `sex`). Steps:
1. Find the parent(s) that render `UnifiedTimeline` — search for `<UnifiedTimeline` in the codebase
2. Add a `patientData?: { birthday?: string | null; sex?: string | null }` prop to the `UnifiedTimeline` props interface
3. Pass patient data from each parent call site (the patient object should already be available in the parent)
4. For `swimlaneRateUnits`: derive from `activeSwimlanes` by building `Record<string, string | null>` from lanes that have `rateUnit` set in their `SwimlaneConfig`

- [ ] **Step 3: Add PK Predict to "others" children**

In `buildActiveSwimlanes()`, modify the "others" children section (around line 1871):

```typescript
if (lane.id === "others" && !collapsedSwimlanes.has("others")) {
  const othersColor = { colorLight: "rgba(233, 213, 255, 0.8)", colorDark: "hsl(280, 55%, 22%)" };
  // BIS is always shown
  lanes.push({
    id: "bis",
    label: "  BIS",
    height: 38,
    ...othersColor,
  });
  // PK Predict only shown when TCI is active and not dismissed
  if (pkSimulation.isActive && !pkSimulation.isDismissed && pkSimulation.missingFields.length === 0) {
    lanes.push({
      id: "pk-prediction",
      label: "  PK Predict",
      height: 55, // Taller to show curves clearly
      ...othersColor,
    });
  }
}
```

- [ ] **Step 4: Render PKPredictionSwimlane in JSX**

After the BISSwimlane rendering (around line 5777), add:

```typescript
{/* PKPredictionSwimlane - PK curves for TIVA cases */}
{pkSimulation.isActive && !pkSimulation.isDismissed && pkSimulation.missingFields.length === 0 && (
  <ErrorBoundary fallback={<div style={{ color: '#666', fontSize: '10px', padding: '4px' }}>PK simulation unavailable</div>}>
    <PKPredictionSwimlane
      swimlanePositions={swimlanePositions}
      pkTimeSeries={pkSimulation.pkTimeSeries}
      currentValues={pkSimulation.currentValues}
      visibleStart={currentZoomStart ?? data.startTime}
      visibleEnd={currentZoomEnd ?? data.endTime}
      isDark={isDark}
      onDismiss={pkSimulation.dismiss}
    />
  </ErrorBoundary>
)}
```

**Note:** You'll need a simple ErrorBoundary component. If one doesn't exist in the codebase, create a minimal one:

```typescript
// Inline or create client/src/components/ErrorBoundary.tsx
import { Component, type ReactNode } from "react";

class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npm run check`
Expected: Clean (fix any type errors from prop threading)

- [ ] **Step 6: Verify visually**

Run: `npm run dev`
1. Open a case with TCI propofol or remifentanil
2. Verify the "Monitoring" swimlane appears after Events
3. Verify BIS is visible under Monitoring
4. Verify PK Predict swimlane appears when TCI drugs are active
5. Verify curves render and update

- [ ] **Step 7: Commit**

```bash
git add client/src/components/anesthesia/UnifiedTimeline.tsx
# Include ErrorBoundary if created
git commit -m "feat(pk): wire PK simulation into UnifiedTimeline with auto-activation"
```

---

### Task 11: eBIS Overlay on BIS Swimlane

**Files:**
- Modify: `client/src/components/anesthesia/swimlanes/BISSwimlane.tsx`

- [ ] **Step 1: Add eBIS prop to BISSwimlane**

Add an optional prop to the `BISSwimlaneProps` interface (line 8):

```typescript
export interface BISSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onBISDialogOpen: (pending: { time: number }) => void;
  onBISEditDialogOpen: (editing: { id: string; time: number; value: number; index: number }) => void;
  // PK simulation eBIS overlay
  eBISTimeSeries?: Array<{ timestamp: number; value: number }>;
  visibleStart?: number;
  visibleEnd?: number;
}
```

- [ ] **Step 2: Render eBIS dashed line**

After the existing BIS point rendering (around line 150), add the eBIS overlay:

```tsx
{/* eBIS prediction overlay */}
{eBISTimeSeries && eBISTimeSeries.length > 0 && bisLane && (() => {
  const range = (visibleEnd ?? 0) - (visibleStart ?? 0);
  if (range <= 0) return null;

  // Build SVG polyline from eBIS data
  const points = eBISTimeSeries
    .filter(pt => pt.timestamp >= (visibleStart ?? 0) && pt.timestamp <= (visibleEnd ?? 0))
    .map(pt => {
      const xFrac = (pt.timestamp - (visibleStart ?? 0)) / range;
      // BIS scale: 0-100, map to lane height
      const yFrac = 1 - (pt.value / 100);
      return `${xFrac * 100},${yFrac * 100}`;
    })
    .join(" ");

  if (!points) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top: `${bisLane.top}px`,
        left: "200px",
        right: "10px",
        height: `${bisLane.height}px`,
        pointerEvents: "none",
        overflow: "visible",
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        stroke="#f87171"
        strokeWidth="1"
        fill="none"
        strokeDasharray="4,3"
        opacity={0.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
})()}
```

- [ ] **Step 3: Pass eBIS data from UnifiedTimeline**

In `UnifiedTimeline.tsx`, update the `BISSwimlane` rendering to pass eBIS data:

```tsx
<BISSwimlane
  swimlanePositions={swimlanePositions}
  isTouchDevice={isTouchDevice}
  onBISDialogOpen={...}
  onBISEditDialogOpen={...}
  eBISTimeSeries={
    pkSimulation.isActive && !pkSimulation.isDismissed
      ? pkSimulation.pkTimeSeries
          .filter(pt => pt.eBIS !== null)
          .map(pt => ({ timestamp: pt.timestamp, value: pt.eBIS! }))
      : undefined
  }
  visibleStart={currentZoomStart ?? data.startTime}
  visibleEnd={currentZoomEnd ?? data.endTime}
/>
```

- [ ] **Step 4: Add eBIS label to BIS swimlane label**

In the swimlane label area, when eBIS is active, show "eBIS: XX" next to "BIS". This is in `buildActiveSwimlanes()` where the BIS child lane is added. Update the label:

```typescript
// In buildActiveSwimlanes, when adding BIS child:
const eBISValue = pkSimulation.currentValues?.eBIS;
const bisLabel = eBISValue !== null && eBISValue !== undefined && pkSimulation.isActive
  ? `  BIS | eBIS ${eBISValue}`
  : "  BIS";
lanes.push({
  id: "bis",
  label: bisLabel,
  height: 38,
  ...othersColor,
});
```

- [ ] **Step 5: Run TypeScript check and verify**

Run: `npm run check`
Run: `npm run dev` — verify eBIS dashed line appears on BIS swimlane when TCI is active

- [ ] **Step 6: Commit**

```bash
git add client/src/components/anesthesia/swimlanes/BISSwimlane.tsx client/src/components/anesthesia/UnifiedTimeline.tsx
git commit -m "feat(pk): add eBIS prediction overlay on BIS swimlane"
```

---

## Chunk 3: PDF Export + Final Polish

### Task 12: PDF Export Integration

**Files:**
- Modify: `client/src/lib/anesthesiaRecordPdf.ts`

At PDF export time, run the simulation from recorded data and render PK curves.

- [ ] **Step 1: Identify the export entry point**

Read `client/src/lib/anesthesiaRecordPdf.ts` to find:
- Where patient data is available (for covariates)
- Where medication records are available (for TCI events)
- Where the timeline chart image is rendered (to add PK alongside)
- The `ExportData` interface (line 83)

- [ ] **Step 2: Add PK simulation to export**

In the export function, after extracting existing data:

```typescript
import { simulate, parsePatientCovariates } from "@/lib/pharmacokinetics";
import type { TargetEvent } from "@/lib/pharmacokinetics";

// Inside the export function, extract TCI events from medication records:
function extractTCIEventsForExport(medications: any[]): { propofol: TargetEvent[]; remi: TargetEvent[] } {
  const propofol: TargetEvent[] = [];
  const remi: TargetEvent[] = [];

  for (const med of medications) {
    if (med.rateUnit !== "TCI") continue;
    const name = (med.drugName || med.name || "").toLowerCase();
    const events = name.includes("propofol") ? propofol : name.includes("remi") ? remi : null;
    if (!events) continue;

    if (med.type === "infusion_start") {
      events.push({ type: "start", timestamp: med.timestamp, targetConcentration: parseFloat(med.dose || "0") });
    } else if (med.type === "rate_change") {
      events.push({ type: "rate_change", timestamp: med.timestamp, targetConcentration: parseFloat(med.rate || "0") });
    } else if (med.type === "infusion_stop") {
      events.push({ type: "stop", timestamp: med.timestamp, targetConcentration: 0 });
    }
  }

  return { propofol, remi };
}
```

Then call `simulate()` with the extracted data and render a summary table in the PDF (PK values at key time points). Full curve rendering in PDF is complex — start with a text summary section:

```typescript
// After existing medication section in PDF:
if (pkTimeSeries.length > 0) {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("PK Simulation (Eleveld/Minto)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  // Show values at key points: start, every 30 min, end
  // ... render as simple text table
}
```

- [ ] **Step 3: Verify PDF export**

Run: `npm run dev` — create a case with TCI, export PDF, verify PK section appears

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/anesthesiaRecordPdf.ts
git commit -m "feat(pk): add PK simulation summary to PDF export"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run all PK unit tests**

Run: `npx vitest run tests/pharmacokinetics/`
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript check**

Run: `npm run check`
Expected: Clean

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 4: Manual verification checklist**

In the dev environment:
1. Open a case with no TCI drugs → PK swimlane does NOT appear
2. Start propofol TCI → PK swimlane appears automatically under "Monitoring"
3. Add remifentanil TCI → both drugs show curves
4. Change propofol target → curves update
5. Stop propofol → curves show decay
6. Click dismiss → PK swimlane hides
7. Refresh page → dismiss state persisted
8. Click restore (via "Monitoring" section) → PK swimlane returns
9. eBIS dashed line appears on BIS swimlane
10. Export PDF → PK summary section present
11. Open a case with missing patient height → PK shows "requires height" instead of crashing
12. Swimlane order: Events → Monitoring (BIS, PK) → TOF → Medications → ...

- [ ] **Step 5: Commit any remaining fixes**

```bash
# Add only the specific files that were modified during polish
git add <list specific files>
git commit -m "feat(pk): final verification and polish for TCI PK simulation"
```
