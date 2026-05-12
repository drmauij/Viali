import { describe, it, expect } from "vitest";
import { findConcept } from "../findConcept";

describe("findConcept", () => {
  const list = [
    { id: "htn", label: "Hypertension", scoringConcept: "HYPERTENSION" },
    { id: "chd", label: "Coronary Heart Disease", scoringConcept: "CAD" },
    { id: "heartFailure", label: "Heart Failure", scoringConcept: "CHF" },
    { id: "heartValve", label: "Heart Valve Disease" }, // no concept
  ];

  it("returns true when a checked item is tagged with the concept", () => {
    expect(findConcept({ htn: true }, list, "HYPERTENSION")).toBe(true);
    expect(findConcept({ chd: true }, list, "CAD")).toBe(true);
    expect(findConcept({ heartFailure: true }, list, "CHF")).toBe(true);
  });

  it("returns false when the matching item is unchecked", () => {
    expect(findConcept({ htn: false }, list, "HYPERTENSION")).toBe(false);
    expect(findConcept({}, list, "HYPERTENSION")).toBe(false);
  });

  it("returns false when no item carries the requested concept", () => {
    expect(findConcept({ heartValve: true }, list, "STROKE_HISTORY")).toBe(false);
  });

  it("ignores items without a scoringConcept even if checked", () => {
    // Heart valve disease is checked but has no concept — does not trip CHF.
    expect(findConcept({ heartValve: true }, list, "CHF")).toBe(false);
  });

  it("returns true if any of multiple matching items is checked", () => {
    const multi = [
      { id: "vte", label: "VTE", scoringConcept: "VTE_HISTORY" },
      { id: "dvt", label: "DVT", scoringConcept: "VTE_HISTORY" },
      { id: "pe", label: "PE", scoringConcept: "VTE_HISTORY" },
    ];
    expect(findConcept({ dvt: true }, multi, "VTE_HISTORY")).toBe(true);
    expect(findConcept({ pe: true }, multi, "VTE_HISTORY")).toBe(true);
    expect(findConcept({ vte: false, dvt: false, pe: false }, multi, "VTE_HISTORY")).toBe(false);
  });

  it("returns false for empty / nullish inputs", () => {
    expect(findConcept(null, list, "HYPERTENSION")).toBe(false);
    expect(findConcept(undefined, list, "HYPERTENSION")).toBe(false);
    expect(findConcept({ htn: true }, null, "HYPERTENSION")).toBe(false);
    expect(findConcept({ htn: true }, undefined, "HYPERTENSION")).toBe(false);
    expect(findConcept({ htn: true }, [], "HYPERTENSION")).toBe(false);
  });
});
