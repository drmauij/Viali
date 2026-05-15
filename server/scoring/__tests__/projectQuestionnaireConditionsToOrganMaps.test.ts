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
