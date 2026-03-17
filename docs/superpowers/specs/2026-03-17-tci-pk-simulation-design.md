# TCI Pharmacokinetic Simulation for Anesthesia Record

**Date:** 2026-03-17
**Status:** Approved

## Overview

Implement real-time pharmacokinetic (PK) simulation for TIVA (Total Intravenous Anesthesia) cases in the anesthesia record. When propofol and/or remifentanil are running in TCI mode, the system calculates and displays predicted plasma concentration (Cp), effect-site concentration (Ce), and estimated BIS (eBIS) based on established pharmacokinetic models.

The PK models are implemented directly from the published academic literature (Eleveld 2018, Minto 1997). The [simtiva](https://github.com/luktinghin/simtiva/) open-source TCI simulator is used as a **validation reference** for comparing outputs, but no code is derived from it (simtiva is GPL-3.0; Viali is ELv2).

## Goals

1. **Real-time decision support** — clinicians see predicted Cp, Ce, and eBIS as they adjust TIVA dosing
2. **Retrospective review** — past cases can be reviewed with PK predictions reconstructed from recorded infusion events
3. **Unobtrusive integration** — appears automatically for TCI cases, dismissable if not wanted

## Models

### Propofol: Eleveld (2018)

Three-compartment model with patient-specific parameters based on age, weight, height, sex, and fat-free mass. Only model that includes a pharmacodynamic component for eBIS prediction via Hill/Emax sigmoid equation mapping Ce to BIS (0-100 scale).

**Reference:** Eleveld DJ et al. "Pharmacokinetic-pharmacodynamic model for propofol for broad application in anaesthesia and sedation." British Journal of Anaesthesia, 2018.

Key parameters (patient-specific):
- V1, V2, V3: compartment volumes
- CL1, CL2, CL3: inter-compartmental clearances
- ke0: effect-site equilibration rate constant
- Derived: k10, k12, k21, k13, k31 rate constants

### Remifentanil: Minto (1997)

Three-compartment model, weight/age/sex-adjusted. No eBIS component (remifentanil contribution to depth modeled independently).

**Reference:** Minto CF et al. "Influence of age and gender on the pharmacokinetics and pharmacodynamics of remifentanil." Anesthesiology, 1997.

### Drug Interaction

Not included in initial implementation. Propofol and remifentanil predictions are calculated independently. Clinicians interpret the combined effect using their clinical judgment (standard practice). Synergy modeling (PTOL/isobolograms) is a future enhancement.

## Architecture

### PK Engine — `client/src/lib/pharmacokinetics/`

Pure TypeScript module, no React dependencies, no side effects.

```
pharmacokinetics/
  types.ts                 — PatientCovariates, InfusionEvent, PKState, PKTimePoint, etc.
  engine.ts                — 3-compartment analytical solver
  tci-controller.ts        — TCI controller: computes infusion rates to achieve target concentrations
  models/
    eleveld-propofol.ts    — Eleveld model: parameter calculation + eBIS (Hill equation)
    minto-remifentanil.ts  — Minto model: parameter calculation
  simulate.ts              — Orchestrator: patient + target events → time-series of Cp/Ce/eBIS
```

#### Three-Compartment Solver (`engine.ts`)

Uses **analytical solution** (not Euler/RK4) with pre-calculated exponential decay factors:

```
new_state = old_state × exp(-λ × Δt) + coef × rate × (1 - exp(-λ × Δt))
```

Where λ values are eigenvalues of the compartment transition matrix derived from k10, k12, k21, k13, k31 rate constants.

- Time resolution: **10-second intervals** for display (smooth curves during induction/rate changes), with the analytical solution keeping this computationally cheap
- Effect-site concentration tracks via ke0
- Numerically stable for arbitrary case durations
- Model parameters validated before simulation: reject if V1 <= 0 or other pathological values

#### TCI Controller (`tci-controller.ts`)

The anesthesia record stores **target concentrations** (e.g., "4 Tc"), not actual pump infusion rates. The TCI controller simulates what a TCI pump would do:

1. Given a target Cp (plasma targeting mode), calculate the infusion rate needed at each time step to achieve/maintain the target
2. At each interval: compare current predicted concentration to target, compute required rate adjustment
3. Handle the three TCI phases: **bolus** (bring concentration up fast), **maintenance** (sustain target), **decay** (wait for redistribution when lowering target)

```typescript
function computeTCIRates(
  model: PKModelParameters,
  targetEvents: TargetEvent[],  // [{timestamp, targetConcentration}]
  timeRange: { start: number; end: number },
  intervalMs: number
): { timestamp: number; rate: number }[]
```

The controller feeds computed rates into the 3-compartment solver to produce predicted Cp/Ce curves.

#### Simulation Orchestrator (`simulate.ts`)

```typescript
function simulate(
  patient: PatientCovariates,
  propofolTargets: TargetEvent[],
  remiTargets: TargetEvent[],
  timeRange: { start: number; end: number }
): PKTimePoint[]
```

Returns array of `PKTimePoint`:
```typescript
interface PKTimePoint {
  timestamp: number;
  propofolCp: number | null;
  propofolCe: number | null;
  remiCp: number | null;
  remiCe: number | null;
  eBIS: number | null;  // null when propofol not active
}
```

Pure function — deterministic output for identical inputs. Can be called from:
- React hook (real-time display)
- PDF export (retrospective rendering)
- Unit tests

#### Input: PatientCovariates

```typescript
interface PatientCovariates {
  age: number;        // years — calculated from patients.birthday
  weight: number;     // kg — parsed from anesthesia record varchar field
  height: number;     // cm — parsed from anesthesia record varchar field
  sex: 'male' | 'female';
}
```

**Data sourcing chain:**
1. `age`: calculated from `patients.birthday` (date field)
2. `weight`: from `anesthesiaRecords.weight` (varchar, parsed to number — strip unit suffixes like "kg")
3. `height`: from `anesthesiaRecords.height` (varchar, parsed to number — strip unit suffixes like "cm")
4. `sex`: mapped from `patients.sex`: `"M"` → `"male"`, `"F"` → `"female"`, `"O"` → defaults to `"male"` (PK models are sex-dimorphic and require binary sex; UI shows a note: "PK simulation using male parameters for unspecified sex")

**Missing data handling:** If any required covariate is missing (null/unparseable), the PK simulation does not activate. The hook returns `isActive: false` with a `missingFields` array so the UI can show: "PK simulation requires [weight, height] — add in patient details."

Fat-free mass (FFM) and lean body mass (LBM) are calculated internally by each model from these inputs.

#### Input: TargetEvent

```typescript
interface TargetEvent {
  type: 'start' | 'rate_change' | 'stop';
  timestamp: number;           // ms epoch
  targetConcentration: number; // the Cp/Ce target value (e.g., 4.0 for "4 Tc")
}
```

Derived from existing `anesthesiaMedications` records where `rateUnit === "TCI"`:
- `infusion_start` → `TargetEvent { type: 'start', targetConcentration: parseFloat(dose) }`
- `rate_change` → `TargetEvent { type: 'rate_change', targetConcentration: parseFloat(rate) }`
- `infusion_stop` → `TargetEvent { type: 'stop', targetConcentration: 0 }`

### React Integration

#### Hook: `client/src/hooks/usePKSimulation.ts`

```typescript
interface PKSimulationResult {
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
  missingFields: string[];  // empty when all covariates available
  dismiss: () => void;
  restore: () => void;
}

function usePKSimulation(
  patientData: { birthday?: string; sex?: string } | null,
  anesthesiaRecord: { weight?: string; height?: string } | null,
  rateInfusionSessions: Record<string, RateInfusionSession[]>,
  medicationConfigs: Map<string, MedicationConfig>,
  caseStartTime: number
): PKSimulationResult
```

**Auto-activation:** Scans `rateInfusionSessions` for running infusions where the corresponding `medicationConfig.rateUnit === "TCI"`. Activates when at least one TCI drug is detected AND all patient covariates are available.

**Recalculation triggers:**
1. **Event-driven:** recalculates when infusion events change (start, rate change, stop)
2. **Background tick:** `setInterval` every 120 seconds to keep current values fresh during stable periods (the full simulation already has 10s resolution — the tick just re-runs it with updated `timeRange.end`)

**Dismiss state:** persisted to `localStorage` keyed by case ID (`pk-dismiss-${caseId}`). Entries are cleaned up when older than 30 days on hook mount.

#### Swimlane: `client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx`

New swimlane rendered as a child of "Monitoring" (label renamed from "Others") in `UnifiedTimeline.tsx`.

**Label area (left sidebar):**
- "PK Predict" with model subtitle ("Eleveld / Minto")
- Collapse/dismiss button
- Current Cp/Ce values for each active drug

**Timeline area:**
- Rendered using SVG overlay (same pattern as BISSwimlane's positioned elements)
- Two curves per drug: Cp (solid line), Ce (dashed line)
- Color-coded to match medication swimlane colors (teal for propofol, pink for remifentanil)
- Current values shown at right edge of visible viewport

**Error boundary:** The PKPredictionSwimlane is wrapped in a React error boundary. If the PK engine throws (e.g., pathological model parameters), the swimlane shows "PK simulation unavailable" rather than crashing the entire timeline.

#### eBIS Overlay on BIS Swimlane

`BISSwimlane.tsx` receives an optional `eBISTimeSeries` prop (array of `{ timestamp, value }`). When provided:
- Renders a dashed red/coral SVG polyline showing predicted eBIS alongside actual BIS points
- Label shows "eBIS: XX" next to existing BIS label
- Uses the same coordinate system / positioning logic as existing BIS point rendering

### Swimlane Reordering

Current order buries BIS at the bottom under "Others". New order for OR mode:

1. Vitals chart (unchanged)
2. Zeiten / Times (unchanged)
3. Ereignisse / Events (unchanged)
4. **Monitoring** (label renamed from "Others", same ID `"others"` preserved for backwards compat with localStorage collapsed state and export types) → **BIS** + **PK Predict**
5. TOF
6. Medications (collapsible parent) → admin groups → items
7. Heart Rhythm
8. Position
9. Ventilation (collapsible parent) → params
10. Output (collapsible parent) → params

The PK Predict lane only renders inside "Monitoring" when TCI drugs are active, patient covariates are available, and the user hasn't dismissed it.

**Implementation:** Move the `"others"` entry in `baseSwimlanes` array from last position to after `"ereignisse"`. Update the displayed label to use `t("anesthesia.timeline.monitoring")` while keeping `id: "others"`. No changes to `SwimlaneExportResult` type or localStorage keys.

### PDF Export

In `anesthesiaRecordPdf.ts`, at export time:
1. Extract patient covariates from case data
2. Extract TCI target events from medication records
3. Call `simulate()` once to produce PK time series
4. Pass the pre-computed time series to the PDF renderer
5. Render Cp/Ce curves and eBIS overlay

No stored data needed — the simulation is reconstructed deterministically from existing records.

## Persistence

**None.** PK predictions are not stored in the database. They are:
- Calculated in real-time during the case (client-side)
- Reconstructed on demand for retrospective review and PDF export

This avoids schema changes, sync issues (e.g., editing past infusion events), and storage overhead. The PK model is deterministic: same inputs always produce same outputs.

## Testing

### Unit Tests (PK Engine)

Critical — the math must be correct for clinical use.

- **Model parameter tests:** Validate Eleveld propofol and Minto remifentanil parameter calculations against published reference values for known patient demographics
- **Solver tests:** Verify 3-compartment analytical solution produces expected concentrations for known inputs
- **TCI controller tests:** Verify computed infusion rates achieve target concentrations within tolerance
- **eBIS tests:** Validate Hill equation output at known Ce values against Eleveld published data
- **End-to-end simulation tests:** Given patient + target events, verify complete Cp/Ce/eBIS time series. Compare against simtiva outputs for identical inputs as validation reference.
- **Edge cases:** extreme ages (18-100), extreme weights (40-200kg), very long cases (>8h), rapid sequential target changes, single-drug cases (propofol only, remi only), sex="O" default behavior
- **Parameter validation:** verify engine rejects pathological parameters (V1 <= 0, negative clearances)

#### Reference Test Vectors

These concrete test cases serve as acceptance criteria:

**Test case 1:** 70kg, 170cm, 40yr male, propofol Eleveld, target Cp = 4.0 μg/ml started at t=0
- Expected: Cp reaches 4.0 within 30s (bolus phase), Ce lags and approaches 4.0 over ~5 min
- eBIS should be in 40-50 range at steady state

**Test case 2:** 60kg, 165cm, 65yr female, remifentanil Minto, target Cp = 4.0 ng/ml started at t=0
- Expected: Cp reaches 4.0 within 30s, Ce equilibrates faster than propofol (higher ke0)

**Test case 3:** Target change — propofol target drops from 4.0 to 3.0 at t=10min
- Expected: Cp decays toward 3.0 (no infusion during decay), Ce follows with lag

Exact numeric values to be validated against published reference tables and simtiva outputs during implementation.

### Integration Tests

- Hook auto-activation when TCI drugs detected
- Hook returns `missingFields` when covariates incomplete
- Hook recalculation on infusion event changes
- Dismiss/restore state persistence and 30-day cleanup
- PDF export produces valid PK data
- Error boundary catches engine failures gracefully

### No Mocking

The PK engine is pure functions — tests run actual calculations and compare against reference values. No mocking of the mathematical core.

## Scope Boundaries

**Included:**
- Eleveld propofol model (Cp, Ce, eBIS)
- Minto remifentanil model (Cp, Ce)
- TCI controller (target → rate computation)
- Real-time display in PK swimlane
- eBIS overlay on BIS swimlane
- Auto-activation for TCI cases with dismiss
- PDF export with reconstructed predictions
- Swimlane reordering (Monitoring moved up)
- Rename "Others" label to "Monitoring" (keep ID)
- Error boundary and missing data handling

**Not included:**
- Drug interaction / synergy modeling (future)
- Marsh, Schnider, Paedfusor models (future — model selector dropdown)
- Settings UI for model selection
- New database tables or schema changes
- Web Worker offloading (math is lightweight enough for main thread)

## References

- Eleveld DJ et al. "Pharmacokinetic-pharmacodynamic model for propofol for broad application in anaesthesia and sedation." BJA 2018
- Minto CF et al. "Influence of age and gender on the pharmacokinetics and pharmacodynamics of remifentanil." Anesthesiology 1997
- STANPUMP (Dr. Steven Shafer) — Original TCI algorithm foundation
- [simtiva](https://github.com/luktinghin/simtiva/) — GPL-3.0 TCI simulator, used as validation reference only (no code derived)
