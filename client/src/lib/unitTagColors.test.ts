// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unitTagClass, UNIT_TAG_COLORS } from "./unitTagColors";

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
