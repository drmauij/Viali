import { describe, it, expect } from "vitest";
import {
  normalizeName,
  calculateNameSimilarity,
} from "../../server/services/patientDeduplication";

describe("patientDeduplication", () => {
  describe("normalizeName", () => {
    it("lowercases and strips diacritics", () => {
      expect(normalizeName("Müller")).toBe("muller");
      expect(normalizeName("José García")).toBe("jose garcia");
    });
    it("removes special characters", () => {
      expect(normalizeName("O'Brien-Smith")).toBe("obriensmith");
    });
    it("collapses whitespace", () => {
      expect(normalizeName("  Mario   Rossi  ")).toBe("mario rossi");
    });
    it("handles empty string", () => {
      expect(normalizeName("")).toBe("");
    });
  });

  describe("calculateNameSimilarity", () => {
    it("returns 1.0 for identical names", () => {
      expect(calculateNameSimilarity("Mario Rossi", "Mario Rossi")).toBe(1);
    });
    it("returns 1.0 for case-insensitive match", () => {
      expect(calculateNameSimilarity("Mario Rossi", "mario rossi")).toBe(1);
    });
    it("high similarity for extra middle name", () => {
      const sim = calculateNameSimilarity(
        "Mario Alberto Rossi",
        "Mario Rossi"
      );
      expect(sim).toBeGreaterThan(0.6);
      expect(sim).toBeLessThan(1.0);
    });
    it("low similarity for completely different names", () => {
      const sim = calculateNameSimilarity("Mario Rossi", "Anna Bianchi");
      expect(sim).toBeLessThan(0.3);
    });
    it("handles empty strings", () => {
      expect(calculateNameSimilarity("", "Mario")).toBe(0);
      expect(calculateNameSimilarity("Mario", "")).toBe(0);
    });
  });
});
