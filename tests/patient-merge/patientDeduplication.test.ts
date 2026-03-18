import { describe, it, expect } from "vitest";
import {
  normalizeName,
  calculateNameSimilarity,
  matchPatientCandidate,
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

describe("matchPatientCandidate", () => {
  const baseInput = {
    firstName: "Mario",
    lastName: "Rossi",
    birthday: "1985-03-15",
  };

  const makeCandidate = (overrides: Partial<{
    firstName: string;
    surname: string;
    birthday: string | null;
    email: string | null;
    phone: string | null;
  }>) => ({
    id: "test-id",
    firstName: overrides.firstName ?? "Mario",
    surname: overrides.surname ?? "Rossi",
    birthday: overrides.birthday ?? "1985-03-15",
    patientNumber: "P-001",
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
  });

  it("returns confidence 1.0 for exact name match with same birthday", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({}));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0);
    expect(result!.reasons).toContain("Exact name match");
    expect(result!.reasons).toContain("Same birthday");
  });

  it("returns confidence 0.95 for swapped first/last name", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({
      firstName: "Rossi",
      surname: "Mario",
    }));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.95);
    expect(result!.reasons).toContain("First/last name swapped");
  });

  it("returns fuzzy match for double name (e.g. 'Maria Luisa' vs 'Maria')", () => {
    const input = { firstName: "Maria", lastName: "Bianchi", birthday: "1990-01-01" };
    const result = matchPatientCandidate(input, makeCandidate({
      firstName: "Maria Luisa",
      surname: "Bianchi",
      birthday: "1990-01-01",
    }));
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result!.confidence).toBeLessThan(0.95);
  });

  it("returns null for completely different names", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({
      firstName: "Anna",
      surname: "Bianchi",
    }));
    expect(result).toBeNull();
  });

  it("boosts confidence for matching email", () => {
    const input = { ...baseInput, email: "mario@test.com" };
    const candidate = makeCandidate({
      firstName: "Rossi",
      surname: "Mario",
      email: "mario@test.com",
    });
    const result = matchPatientCandidate(input, candidate);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0); // 0.95 + 0.05, capped at 1.0
    expect(result!.reasons).toContain("Matching email");
  });

  it("boosts confidence for matching phone", () => {
    const input = { ...baseInput, phone: "+41 79 123 4567" };
    const candidate = makeCandidate({
      firstName: "Rossi",
      surname: "Mario",
      phone: "+4179 123 4567",
    });
    const result = matchPatientCandidate(input, candidate);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0); // 0.95 + 0.05, capped
    expect(result!.reasons).toContain("Matching phone number");
  });

  it("returns null when candidate has no name", () => {
    const result = matchPatientCandidate(baseInput, makeCandidate({
      firstName: "",
      surname: "",
    }));
    expect(result).toBeNull();
  });
});
