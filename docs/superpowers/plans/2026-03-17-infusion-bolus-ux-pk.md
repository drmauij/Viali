# Infusion Bolus UX & PK Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bolus UX in rate infusion dialogs (preset behavior, unit selection, mid-infusion bolus) and integrate boluses into PK simulation. TCI mode retains current immediate-start behavior with no bolus fields.

**Architecture:** Five tasks improving the infusion start/manage workflow. For non-TCI: preset clicks fill the rate field instead of immediately starting; bolus unit derives from rate unit base (mg/kg/h → mg, mcg/kg/min → mcg). For TCI: preset clicks keep current immediate-start behavior, bolus fields are hidden (pump manages everything). PK forward simulation gains bolus support via instantaneous high-rate segments. Mid-infusion boluses become possible via the RateManageDialog (non-TCI only).

**Tech Stack:** React, TypeScript, Vitest, existing PK pharmacokinetics engine

---

## Key Design Decision: TCI vs Non-TCI Behavior

| Feature | Non-TCI (TIVA) | TCI |
|---------|----------------|-----|
| Preset click | Fills custom rate field (review before start) | Immediate start (current behavior) |
| Initial bolus field | Shown with derived unit | Hidden (pump manages) |
| Mid-infusion bolus | Available in manage dialog | Hidden |
| Note field | Available | Available (keep current) |
| PK bolus integration | Yes | N/A |

---

## Problem Summary

1. **Preset click starts immediately (non-TCI)** — no chance to add bolus. Should fill the custom rate field instead. TCI keeps current immediate behavior.
2. **Bolus unit hardcoded** — shows "(optional)" with no unit or hardcoded ml. Should derive from rate unit's base (mg/kg/h → mg, mcg/kg/min → mcg). Hidden for TCI.
3. **Bolus not in PK calculation** — `initialBolus` field exists on sessions but is ignored by `extractRateSegments`.
4. **No mid-infusion bolus** — can't add a bolus while non-TCI infusion is running. Need a bolus field in RateManageDialog.

## Current Data Flow

```
RateSelectionDialog → handleRateSelection() → createMedication.mutate(type:'infusion_start', initialBolus)
                                                  ↓
                                         DB: anesthesia_medications.initial_bolus
                                                  ↓
                                     transformRateInfusions() → session.initialBolus
                                                  ↓
                                     usePKSimulation → extractRateSegments()
                                           (currently IGNORES initialBolus)
```

**Note:** `SaveMedicationPayload` interface in `timelinePersistence.ts` is missing `initialBolus`, but the actual mutation path uses `InsertAnesthesiaMedication` from the schema which already includes it. Adding it to `SaveMedicationPayload` is optional cleanup (not a blocking bug).

---

### Task 1: Split Preset Behavior — TCI Immediate vs Non-TCI Fill-Field

**Files:**
- Modify: `client/src/components/anesthesia/dialogs/RateSelectionDialog.tsx`

**New behavior:**
- **TCI (`rateUnit === "TCI"`):** Clicking a preset calls `onRateSelection(rate)` immediately and closes dialog (CURRENT behavior, unchanged)
- **Non-TCI:** Clicking a preset fills the custom rate input field. User reviews and clicks "Start Infusion" to confirm — giving them the chance to also add a bolus.

- [ ] **Step 1: Add `rateUnit` prop**

```tsx
interface RateSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingRateSelection: PendingRateSelection | null;
  onRateSelection: (selectedRate: string, initialBolus?: string) => void;
  onCustomRateEntry: (customRate: string, initialBolus?: string) => void;
  administrationUnit?: string | null;
  rateUnit?: string | null;  // NEW
}
```

- [ ] **Step 2: Change preset click based on mode**

```tsx
const isTCI = rateUnit === "TCI";

const handlePresetRate = (rate: string) => {
  if (isTCI) {
    // TCI: immediate start (current behavior) — pump manages everything
    onRateSelection(rate);
    handleClose();
  } else {
    // Non-TCI: fill custom field so user can review + add bolus
    setCustomRateInput(rate);
  }
};
```

Highlight selected preset for non-TCI:
```tsx
<Button
  key={idx}
  onClick={() => handlePresetRate(rate)}
  variant={!isTCI && customRateInput === rate ? "default" : "outline"}
  className="h-12"
  data-testid={`button-rate-option-${rate}`}
>
  {rate}
</Button>
```

- [ ] **Step 3: Unified start handler for non-TCI**

Replace `handleCustomRate` with a unified `handleStart`:

```tsx
const handleStart = () => {
  const rate = customRateInput.trim();
  if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
    toast({ title: t('dialogs.invalidRate'), description: t('dialogs.enterValidPositiveNumber'), variant: "destructive" });
    return;
  }
  const bolus = initialBolusInput.trim();
  if (bolus && (isNaN(Number(bolus)) || Number(bolus) <= 0)) {
    toast({ title: t('dialogs.invalidBolus', 'Invalid bolus'), description: t('dialogs.enterValidPositiveNumber'), variant: "destructive" });
    return;
  }
  onRateSelection(rate, bolus || undefined);
  handleClose();
};
```

Update save button:
```tsx
onSave={handleStart}
saveDisabled={!customRateInput.trim() || isNaN(Number(customRateInput)) || Number(customRateInput) <= 0}
saveLabel={isTCI ? t('dialogs.setCustom') : t('anesthesia.timeline.startInfusion', 'Start Infusion')}
```

- [ ] **Step 4: Hide bolus field for TCI**

Wrap the initial bolus section:
```tsx
{!isTCI && (
  <div className="grid gap-2 pt-2">
    <Label htmlFor="initial-bolus" className="text-sm">
      {t('dialogs.initialBolus')} ({bolusUnit}) <span className="text-muted-foreground">({t('common.optional')})</span>
    </Label>
    ...
  </div>
)}
```

- [ ] **Step 5: Pass rateUnit from UnifiedTimeline**

Where `RateSelectionDialog` is rendered in UnifiedTimeline.tsx, pass:
```tsx
rateUnit={pendingRateSelection ? swimlaneMetadata[pendingRateSelection.swimlaneId]?.rateUnit : null}
```

- [ ] **Step 6: Test manually**

Non-TCI:
1. Click preset rate → fills custom field, does NOT start
2. Enter bolus value → click "Start Infusion" → starts with rate + bolus
3. Enter key in custom field works

TCI:
1. Click preset rate → immediately starts, dialog closes (unchanged)
2. No bolus field visible

- [ ] **Step 7: Commit**

---

### Task 2: Dynamic Bolus Unit from Rate Unit

**Files:**
- Create helper in: `client/src/lib/pharmacokinetics/rate-conversion.ts`
- Modify: `client/src/components/anesthesia/dialogs/RateSelectionDialog.tsx`
- Modify: `client/src/components/anesthesia/dialogs/InfusionDialog.tsx` (same bolus unit issue)

- [ ] **Step 1: Add `deriveBolusUnit` to rate-conversion.ts**

Shared helper — used by both UI dialogs and PK simulation:

```tsx
/**
 * Derive the bolus unit from the rate unit.
 * mg/kg/h → mg, mcg/kg/min → mcg, ml/h → ml
 */
export function deriveBolusUnit(rateUnit: string | null | undefined, fallback?: string | null): string {
  if (!rateUnit) return fallback || "ml";
  const normalized = rateUnit.replace(/µ/g, "μ").replace(/ug/gi, "μg").replace(/mcg/gi, "μg");
  const match = normalized.match(/^(mg|μg|g|ml)/i);
  if (match) return match[1];
  return fallback || "ml";
}
```

- [ ] **Step 2: Use in RateSelectionDialog**

```tsx
import { deriveBolusUnit } from "@/lib/pharmacokinetics/rate-conversion";

// Inside component:
const bolusUnit = deriveBolusUnit(rateUnit, administrationUnit);
```

Update bolus label:
```tsx
<Label htmlFor="initial-bolus" className="text-sm">
  {t('dialogs.initialBolus')} ({bolusUnit}) <span className="text-muted-foreground">({t('common.optional')})</span>
</Label>
```

- [ ] **Step 3: Fix same issue in InfusionDialog.tsx**

Apply the same `deriveBolusUnit` logic wherever bolus input appears in `InfusionDialog.tsx`.

- [ ] **Step 4: Store bolus as number only**

The bolus unit is always derivable from the rate unit — no need to store it. Keep `initialBolus` as a plain number string in the DB (e.g., `"150"`). Derive the unit when displaying or calculating.

- [ ] **Step 5: Add tests for deriveBolusUnit**

In `tests/pharmacokinetics/rate-conversion.test.ts`:
```tsx
describe("deriveBolusUnit", () => {
  it("mg/kg/h → mg", () => expect(deriveBolusUnit("mg/kg/h")).toBe("mg"));
  it("μg/kg/min → μg", () => expect(deriveBolusUnit("μg/kg/min")).toBe("μg"));
  it("mcg/kg/min → μg", () => expect(deriveBolusUnit("mcg/kg/min")).toBe("μg"));
  it("ml/h → ml", () => expect(deriveBolusUnit("ml/h")).toBe("ml"));
  it("null → fallback", () => expect(deriveBolusUnit(null, "mg")).toBe("mg"));
  it("null no fallback → ml", () => expect(deriveBolusUnit(null)).toBe("ml"));
});
```

- [ ] **Step 6: Commit**

---

### Task 3: Integrate Bolus into PK Forward Simulation

**Files:**
- Modify: `client/src/lib/pharmacokinetics/rate-conversion.ts` — add `convertBolusToSegment()`
- Modify: `client/src/hooks/usePKSimulation.ts` — `extractRateSegments()` and pkTimeSeries memo
- Create: `tests/pharmacokinetics/bolus-pk.test.ts`

The initial bolus is a one-time dose. In the 3-compartment model, model it as a very short high-rate infusion (10 seconds). The bolus segment starts at `session.startTime` and the continuous rate segment starts 10s later to avoid overlap.

- [ ] **Step 1: Add `convertBolusToSegment` to rate-conversion.ts**

```tsx
import type { RateSegment } from "./forward-simulation";

/** Duration to model a bolus push (aligns with CPT_INTERVAL_S = 10s) */
const BOLUS_DURATION_MS = 10_000;

/**
 * Convert a bolus dose to an equivalent short high-rate infusion segment.
 * A bolus of X mg over 10 seconds = X * 6 mg/min for 10 seconds.
 */
export function convertBolusToSegment(
  bolusValue: number,
  bolusUnit: string,
  drug: "propofol" | "remifentanil",
  concentrationMgPerMl: number | null,
  timestamp: number,
): RateSegment | null {
  if (bolusValue <= 0) return null;

  // Convert bolus to mg
  const unit = bolusUnit.replace(/µ/g, "μ").replace(/ug/gi, "μg").replace(/mcg/gi, "μg").toLowerCase();
  let bolusMg: number;
  if (unit === "mg") bolusMg = bolusValue;
  else if (unit === "μg") bolusMg = bolusValue / 1000;
  else if (unit === "g") bolusMg = bolusValue * 1000;
  else if (unit === "ml") {
    if (!concentrationMgPerMl) return null;
    bolusMg = bolusValue * concentrationMgPerMl;
  } else return null;

  const durationMin = BOLUS_DURATION_MS / 60_000;
  const mgPerMin = bolusMg / durationMin;

  // Convert to engine unit
  const engineRate = drug === "propofol" ? mgPerMin : mgPerMin * 1000;

  return {
    startTime: timestamp,
    endTime: timestamp + BOLUS_DURATION_MS,
    rateMassPerMin: engineRate,
  };
}
```

- [ ] **Step 2: Write tests**

```tsx
// tests/pharmacokinetics/bolus-pk.test.ts
import { describe, it, expect } from "vitest";
import { convertBolusToSegment, deriveBolusUnit } from "../../client/src/lib/pharmacokinetics/rate-conversion";

describe("convertBolusToSegment", () => {
  it("converts mg bolus for propofol", () => {
    const seg = convertBolusToSegment(150, "mg", "propofol", null, 1000);
    expect(seg).not.toBeNull();
    expect(seg!.rateMassPerMin).toBeCloseTo(900); // 150mg / (10/60)min = 900 mg/min
    expect(seg!.endTime - seg!.startTime).toBe(10_000);
  });

  it("converts mcg bolus for remifentanil", () => {
    const seg = convertBolusToSegment(50, "mcg", "remifentanil", null, 1000);
    expect(seg).not.toBeNull();
    // 50mcg = 0.05mg → 0.05/(10/60) = 0.3 mg/min → engine: 300 mcg/min
    expect(seg!.rateMassPerMin).toBeCloseTo(300);
  });

  it("converts ml bolus using concentration", () => {
    const seg = convertBolusToSegment(20, "ml", "propofol", 10, 1000); // 10mg/ml
    expect(seg).not.toBeNull();
    // 20ml * 10mg/ml = 200mg → 200/(10/60) = 1200 mg/min
    expect(seg!.rateMassPerMin).toBeCloseTo(1200);
  });

  it("returns null for ml without concentration", () => {
    expect(convertBolusToSegment(20, "ml", "propofol", null, 1000)).toBeNull();
  });

  it("returns null for zero bolus", () => {
    expect(convertBolusToSegment(0, "mg", "propofol", null, 1000)).toBeNull();
  });

  it("returns null for negative bolus", () => {
    expect(convertBolusToSegment(-10, "mg", "propofol", null, 1000)).toBeNull();
  });
});
```

- [ ] **Step 3: Integrate into extractRateSegments**

In `usePKSimulation.ts`, import the new helpers and update `extractRateSegments`:

```tsx
import { convertToMassPerMin, parseDrugConcentration, convertBolusToSegment, deriveBolusUnit } from "@/lib/pharmacokinetics";
```

Inside the session loop, before the existing rate segment extraction:

```tsx
// Initial bolus → short high-rate segment (offset infusion start by BOLUS_DURATION)
const BOLUS_DURATION_MS = 10_000;
const bolusUnit = deriveBolusUnit(meta?.rateUnit);

if (session.initialBolus) {
  const bolusValue = parseFloat(session.initialBolus);
  if (!isNaN(bolusValue) && bolusValue > 0) {
    const bolusSeg = convertBolusToSegment(
      bolusValue, bolusUnit, drug, concentrationMgPerMl, session.startTime
    );
    if (bolusSeg) segments.push(bolusSeg);
  }
}
```

And offset the first rate segment's startTime by 10s when a bolus is present, to avoid overlap:

```tsx
const segStartTime = (i === 0 && session.initialBolus) ? seg.startTime + BOLUS_DURATION_MS : seg.startTime;
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/pharmacokinetics/
```

- [ ] **Step 5: Test manually**

Start propofol at 5 mg/kg/h with 150mg initial bolus. PK Predict should show:
- Sharp Cp spike from the bolus at infusion start
- Cp settles to steady-state from the continuous rate
- eBIS drops sharply at the bolus then stabilizes

- [ ] **Step 6: Commit**

---

### Task 4: Add Mid-Infusion Bolus to RateManageDialog (Non-TCI Only)

**Files:**
- Modify: `client/src/components/anesthesia/dialogs/RateManageDialog.tsx`
- Modify: `client/src/components/anesthesia/unifiedTimeline/useInfusionHandlers.ts`
- Modify: `client/src/hooks/useMedicationState.ts` — add `midBoluses` to `RateInfusionSession`
- Modify: `client/src/services/timelineTransform.ts` — populate `midBoluses` from DB records
- Modify: `client/src/hooks/usePKSimulation.ts` — include mid-boluses in `extractRateSegments`

When a non-TCI infusion is running and the user clicks it, they should see a "Give Bolus" section in the manage dialog. Not shown for TCI.

- [ ] **Step 1: Add `midBoluses` to RateInfusionSession**

In `usePKSimulation.ts` (or `useMedicationState.ts`):
```tsx
export interface RateInfusionSession {
  // ... existing fields
  midBoluses?: Array<{ timestamp: number; dose: string }>;
}
```

- [ ] **Step 2: Populate midBoluses in transformRateInfusions**

In `timelineTransform.ts`, after building a session, scan for bolus records that reference this session's `infusionSessionId` or fall within the session's time window:

```tsx
const midBoluses = records
  .filter(r => r.type === 'bolus' && r.infusionSessionId === startRecord.id)
  .map(r => ({ timestamp: new Date(r.timestamp).getTime(), dose: r.dose || '0' }));

sessions[swimlaneId].push({
  // ... existing fields
  midBoluses,
});
```

- [ ] **Step 3: Add bolus UI to RateManageDialog**

Add new prop:
```tsx
onGiveBolus?: (dose: string, unit: string) => void;
```

Add state and handler:
```tsx
const [midBolusInput, setMidBolusInput] = useState("");
const bolusUnit = deriveBolusUnit(managingRate?.rateUnit);

const handleGiveBolus = () => {
  const dose = midBolusInput.trim();
  if (!dose || isNaN(Number(dose)) || Number(dose) <= 0) return;
  onGiveBolus?.(dose, bolusUnit);
  setMidBolusInput("");
};
```

Add UI section (non-TCI running mode only, after rate adjustment):
```tsx
{isRunning && !isTciMode && (
  <div className="grid gap-2 pt-2 border-t">
    <Label htmlFor="mid-bolus" className="text-sm font-medium">
      {t("anesthesia.timeline.giveBolus", "Give Bolus")} ({bolusUnit})
    </Label>
    <div className="flex items-center gap-2">
      <Input
        id="mid-bolus"
        type="number"
        inputMode="decimal"
        value={midBolusInput}
        onChange={(e) => setMidBolusInput(e.target.value)}
        placeholder="e.g., 50"
        className="text-center h-10"
        onKeyDown={(e) => { if (e.key === 'Enter') handleGiveBolus(); }}
      />
      <Button onClick={handleGiveBolus} disabled={!midBolusInput.trim()} size="sm">
        {t("anesthesia.timeline.give", "Give")}
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Wire handler in useInfusionHandlers**

Create `handleGiveMidBolus` that creates a `bolus` medication record via `createMedication.mutate()`, linked to the running session:

```tsx
const handleGiveMidBolus = (dose: string, unit: string) => {
  if (!managingRate || !anesthesiaRecordId) return;
  const activeSession = getActiveRateSession(managingRate.swimlaneId);
  if (!activeSession) return;

  createMedication.mutate({
    anesthesiaRecordId,
    itemId: activeSession.id ? /* resolve itemId from swimlane */ : undefined,
    timestamp: new Date(),
    type: 'bolus',
    dose: `${dose}`,
    unit,
    infusionSessionId: activeSession.id,
  });
};
```

- [ ] **Step 5: Include mid-boluses in PK extractRateSegments**

In `extractRateSegments`, after processing initial bolus and rate segments:

```tsx
// Mid-infusion boluses
if (session.midBoluses) {
  for (const bolus of session.midBoluses) {
    const bolusValue = parseFloat(bolus.dose);
    if (!isNaN(bolusValue) && bolusValue > 0) {
      const bolusSeg = convertBolusToSegment(
        bolusValue, bolusUnit, drug, concentrationMgPerMl, bolus.timestamp
      );
      if (bolusSeg) segments.push(bolusSeg);
    }
  }
}
```

- [ ] **Step 6: Test manually**

1. Start propofol infusion at 5 mg/kg/h (no initial bolus)
2. Wait 2 minutes → click running infusion
3. RateManageDialog shows: rate adjustment + "Give Bolus (mg)" section
4. Enter 50 → click "Give" → toast confirms
5. PK Predict shows Cp spike at the bolus timestamp
6. For TCI infusion: verify "Give Bolus" section is NOT visible

- [ ] **Step 7: Commit**

---

## Implementation Order

```
Task 1 (preset UX split) → Task 2 (bolus unit) → Task 3 (PK bolus) → Task 4 (mid-infusion bolus)
```

Tasks 1-2 are pure UX (no backend changes). Task 3 adds PK integration. Task 4 adds mid-infusion bolus (depends on Task 3 for `convertBolusToSegment`).

## Out of Scope

- **TCI bolus handling** — TCI pumps manage boluses internally; no UI or PK changes needed
- **Bolus PK interaction with remi on eBIS** — eBIS depends only on propofol Ce (Eleveld model)
- **i18n** — add translation keys with English fallbacks, translate later
- **`SaveMedicationPayload` cleanup** — optional; the actual mutation path already supports `initialBolus`
