// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unitTagClass, unitRailBeforeClass, UNIT_TAG_COLORS, RAIL_BEFORE } from "./unitTagColors";

describe("unitTagColors", () => {
  it("returns a stable Tailwind class per unit type", () => {
    expect(unitTagClass("anesthesia")).toBe(UNIT_TAG_COLORS.anesthesia.bg);
    expect(unitTagClass("or")).toBe(UNIT_TAG_COLORS.or.bg);
    expect(unitTagClass("clinic")).toBe(UNIT_TAG_COLORS.clinic.bg);
    expect(unitTagClass("business")).toBe(UNIT_TAG_COLORS.business.bg);
    expect(unitTagClass("logistic")).toBe(UNIT_TAG_COLORS.logistic.bg);
  });

  it("returns a neutral class for null/unknown", () => {
    expect(unitTagClass(null)).toBe(UNIT_TAG_COLORS.public.bg);
    expect(unitTagClass("something" as any)).toBe(UNIT_TAG_COLORS.public.bg);
  });

  it("exposes a separate platform tag for cross-tenant rows", () => {
    expect(UNIT_TAG_COLORS.platform.bg).toBeDefined();
    expect(UNIT_TAG_COLORS.platform.bg).not.toBe(UNIT_TAG_COLORS.anesthesia.bg);
  });
});

describe("unitRailBeforeClass", () => {
  it("returns a literal before:bg-* class for each unit type", () => {
    // The literal string must exist in source — Tailwind JIT scans for exact strings
    expect(unitRailBeforeClass("anesthesia")).toBe(RAIL_BEFORE.anesthesia);
    expect(unitRailBeforeClass("or")).toBe(RAIL_BEFORE.or);
    expect(unitRailBeforeClass("clinic")).toBe(RAIL_BEFORE.clinic);
    expect(unitRailBeforeClass("business")).toBe(RAIL_BEFORE.business);
    expect(unitRailBeforeClass("logistic")).toBe(RAIL_BEFORE.logistic);
  });

  it("anesthesia rail class includes both 'before:' and 'bg-rose-'", () => {
    const cls = unitRailBeforeClass("anesthesia");
    expect(cls).toContain("before:");
    expect(cls).toContain("bg-rose-");
  });

  it("returns public (zinc) class for null/unknown", () => {
    expect(unitRailBeforeClass(null)).toBe(RAIL_BEFORE.public);
    expect(unitRailBeforeClass("something-unknown")).toBe(RAIL_BEFORE.public);
  });
});
