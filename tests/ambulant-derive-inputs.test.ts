import { describe, it, expect } from "vitest";
import {
  deriveQuickCheckInputsFromBody,
  computeQuickCheckSnapshot,
} from "../server/scoring/computeAmbulantQuickCheck";

describe("deriveQuickCheckInputsFromBody", () => {
  it("derives age from patient.birthday (not dateOfBirth)", () => {
    const fortyYearsAgo = new Date();
    fortyYearsAgo.setFullYear(fortyYearsAgo.getFullYear() - 40);
    const inputs = deriveQuickCheckInputsFromBody(
      { stayType: "ambulant", surgeryRiskClass: "standard" },
      { birthday: fortyYearsAgo.toISOString().slice(0, 10) },
      null,
    );
    expect(inputs.ageYears).toBeGreaterThanOrEqual(39);
    expect(inputs.ageYears).toBeLessThanOrEqual(41);
  });

  it("maps patient.sex M → male, F → female", () => {
    expect(
      deriveQuickCheckInputsFromBody({}, { sex: "M" }, null).sex,
    ).toBe("male");
    expect(
      deriveQuickCheckInputsFromBody({}, { sex: "F" }, null).sex,
    ).toBe("female");
    expect(
      deriveQuickCheckInputsFromBody({}, { sex: "O" }, null).sex,
    ).toBe(null);
  });

  it("computes plannedMinutes from body.plannedDate + body.actualEndTime", () => {
    const start = new Date("2026-06-01T08:00:00Z");
    const end = new Date("2026-06-01T11:30:00Z");
    const inputs = deriveQuickCheckInputsFromBody(
      { plannedDate: start, actualEndTime: end },
      null,
      null,
    );
    expect(inputs.plannedMinutes).toBe(210);
  });

  it("falls back to existing surgery values when body fields are missing", () => {
    const start = new Date("2026-06-01T08:00:00Z");
    const end = new Date("2026-06-01T13:00:00Z");
    const inputs = deriveQuickCheckInputsFromBody(
      {},
      null,
      { plannedDate: start, actualEndTime: end, surgeryRiskClass: "critical", stayType: "ambulant" },
    );
    expect(inputs.plannedMinutes).toBe(300);
    expect(inputs.surgeryRiskClass).toBe("critical");
    expect(inputs.stayType).toBe("ambulant");
  });

  it("treats missing patient as conservative (no demographics)", () => {
    const inputs = deriveQuickCheckInputsFromBody(
      { surgeryRiskClass: "standard", stayType: "ambulant" },
      null,
      null,
    );
    expect(inputs.ageYears).toBe(null);
    expect(inputs.sex).toBe(null);
    expect(inputs.bmi).toBe(null);
  });
});

describe("computeQuickCheckSnapshot", () => {
  it("PKK Friday case produces red snapshot with reasons + audit metadata", () => {
    const snapshot = computeQuickCheckSnapshot(
      {
        ageYears: 58,
        bmi: null,
        sex: "male",
        plannedMinutes: 300,
        surgeryRiskClass: "critical",
        stayType: "ambulant",
        knownOsasUntreated: false,
        vteHistory: false,
        activeCancer: false,
      },
      "user-fixture-1",
    );
    expect(snapshot.decision).toBe("red");
    expect(snapshot.hardExclusions.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.calculatedBy).toBe("user-fixture-1");
    expect(snapshot.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves inputs in the snapshot for legal reproducibility", () => {
    const inputs = {
      ageYears: 40,
      bmi: null,
      sex: "female" as const,
      plannedMinutes: 90,
      surgeryRiskClass: "standard" as const,
      stayType: "ambulant" as const,
      knownOsasUntreated: false,
      vteHistory: false,
      activeCancer: false,
    };
    const snapshot = computeQuickCheckSnapshot(inputs, "u1");
    expect(snapshot.inputs).toEqual(inputs);
  });
});
