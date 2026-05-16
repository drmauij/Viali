// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  getVisibleModules,
  getInternalShortcuts,
  type ModuleId,
  type HospitalAccess,
} from "./moduleVisibility";

const allAddons = {
  surgery: true,
  clinic: true,
  questionnaire: true,
  worktime: true,
  logistics: true,
};

const noAddons = {
  surgery: false,
  clinic: false,
  questionnaire: false,
  worktime: false,
  logistics: false,
};

function access(over: Partial<HospitalAccess> = {}): HospitalAccess {
  return {
    role: "admin",
    unitType: "anesthesia",
    addons: allAddons,
    isGroupAdmin: false,
    isPlatformOperator: false,
    ...over,
  };
}

describe("getVisibleModules", () => {
  it("anesthesia/admin sees anesthesia, inventory, administration", () => {
    expect(getVisibleModules(access({ unitType: "anesthesia" }))).toEqual([
      "anesthesia",
      "inventory",
      "administration",
    ]);
  });

  it("or/admin sees surgery, inventory, administration", () => {
    expect(getVisibleModules(access({ unitType: "or" }))).toEqual([
      "surgery",
      "inventory",
      "administration",
    ]);
  });

  it("or/admin without surgery addon still sees surgery (legacy addon is no longer a gate)", () => {
    const result = getVisibleModules(
      access({ unitType: "or", addons: { ...allAddons, surgery: false } }),
    );
    expect(result).toContain<ModuleId>("surgery");
  });

  it("clinic/admin sees clinic, inventory, administration", () => {
    expect(getVisibleModules(access({ unitType: "clinic" }))).toEqual([
      "clinic",
      "inventory",
      "administration",
    ]);
  });

  it("clinic/admin without clinic addon still sees clinic (legacy addon is no longer a gate)", () => {
    const result = getVisibleModules(
      access({ unitType: "clinic", addons: { ...allAddons, clinic: false } }),
    );
    expect(result).toContain<ModuleId>("clinic");
  });

  it("business/admin sees business + administration", () => {
    expect(getVisibleModules(access({ unitType: "business" }))).toEqual([
      "business",
      "administration",
    ]);
  });

  it("business/marketing sees business only (no admin)", () => {
    expect(
      getVisibleModules(access({ unitType: "business", role: "marketing" })),
    ).toEqual(["business"]);
  });

  it("anesthesia/doctor hides administration", () => {
    expect(
      getVisibleModules(access({ unitType: "anesthesia", role: "doctor" })),
    ).toEqual(["anesthesia", "inventory"]);
  });

  it("logistic/admin sees logistic + administration when logistics addon enabled", () => {
    expect(getVisibleModules(access({ unitType: "logistic" }))).toEqual([
      "logistic",
      "administration",
    ]);
  });

  it("logistic/admin without logistics addon yields administration only", () => {
    expect(
      getVisibleModules(
        access({ unitType: "logistic", addons: { ...allAddons, logistics: false } }),
      ),
    ).toEqual(["administration"]);
  });

  it("platform operator sees Platform module across any unit", () => {
    expect(
      getVisibleModules(access({ unitType: "anesthesia", isPlatformOperator: true })),
    ).toContain<ModuleId>("platform");
  });

  it("non-platform operator never sees Platform", () => {
    expect(
      getVisibleModules(access({ unitType: "anesthesia", isPlatformOperator: false })),
    ).not.toContain<ModuleId>("platform");
  });

  it("no-addons admin still sees administration row", () => {
    expect(
      getVisibleModules(access({ unitType: "anesthesia", addons: noAddons })),
    ).toContain<ModuleId>("administration");
  });
});

describe("getInternalShortcuts", () => {
  it("anesthesia/admin with worktime addon gets a worklogs-anesthesia row", () => {
    const shortcuts = getInternalShortcuts(access({ unitType: "anesthesia" }));
    expect(shortcuts.map(s => s.id)).toContain("worklogs-anesthesia");
  });

  it("or/admin with worktime addon gets a worklogs-surgery row", () => {
    const shortcuts = getInternalShortcuts(access({ unitType: "or" }));
    expect(shortcuts.map(s => s.id)).toContain("worklogs-surgery");
  });

  it("no worktime addon → no worklogs shortcut", () => {
    const shortcuts = getInternalShortcuts(
      access({ unitType: "anesthesia", addons: noAddons }),
    );
    expect(shortcuts.map(s => s.id)).not.toContain("worklogs-anesthesia");
  });

  it("checklists is no longer a per-role shortcut (moved to its own dropdown tab)", () => {
    const shortcuts = getInternalShortcuts(access({ unitType: "anesthesia" }));
    expect(shortcuts.find(s => (s.id as string) === "checklists")).toBeUndefined();
  });
});
