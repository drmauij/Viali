import { describe, it, expect } from "vitest";
import { HEADING_FONTS, BODY_FONTS, nearestMatch } from "../server/lib/googleFontsCatalog";

describe("google fonts catalog", () => {
  it("contains at least 8 heading and 8 body fonts", () => {
    expect(HEADING_FONTS.length).toBeGreaterThanOrEqual(8);
    expect(BODY_FONTS.length).toBeGreaterThanOrEqual(8);
  });

  it("nearestMatch returns the input if already in catalog", () => {
    expect(nearestMatch("Inter", "body")).toBe("Inter");
    expect(nearestMatch("Playfair Display", "heading")).toBe("Playfair Display");
  });

  it("nearestMatch maps proprietary fonts to a valid catalog font", () => {
    const result = nearestMatch("Avenir Next", "body");
    expect(BODY_FONTS).toContain(result);
  });

  it("nearestMatch falls back to a default for unknown garbage", () => {
    expect(nearestMatch("xyz-not-a-font-99", "body")).toBe("Inter");
    expect(nearestMatch("xyz-not-a-font-99", "heading")).toBe("Playfair Display");
  });
});
