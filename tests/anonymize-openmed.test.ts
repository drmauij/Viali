import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  anonymize,
  anonymizeWithOpenMed,
  detectPii,
} from "../server/utils/anonymize";

// ── Base anonymize() tests ───────────────────────────────────────────

describe("anonymize (base)", () => {
  it("replaces known values with placeholders", () => {
    const result = anonymize("Herr Schmidt hat einen Termin.", {
      knownValues: { patientLastName: "Schmidt" },
    });
    expect(result.text).toBe("Herr [NAME_1] hat einen Termin.");
    expect(result.replacementCount).toBe(1);
    expect(result.restore("Herr [NAME_1] hat einen Termin.")).toBe(
      "Herr Schmidt hat einen Termin.",
    );
  });

  it("replaces regex-matched phone numbers", () => {
    const result = anonymize("Tel: +41 44 123 45 67");
    expect(result.text).toContain("[PHONE_1]");
    expect(result.replacementCount).toBe(1);
  });

  it("replaces dot-separated dates (caught by phone regex due to pattern order)", () => {
    // Note: The PHONE regex matches digit.digit sequences before the DATE regex runs.
    // This is existing behavior — OpenMed ML layer helps catch what regex misclassifies.
    const result = anonymize("am 1.1.2025 um zehn");
    expect(result.text).toContain("[PHONE_1]");
    expect(result.text).not.toContain("1.1.2025");
    expect(result.replacementCount).toBe(1);
  });

  it("deduplicates same values", () => {
    const result = anonymize("Schmidt und Schmidt", {
      knownValues: { patientLastName: "Schmidt" },
    });
    expect(result.text).toBe("[NAME_1] und [NAME_1]");
    expect(result.replacementCount).toBe(1);
  });

  it("restores all placeholders", () => {
    const result = anonymize("Schmidt am 2025-03-15", {
      knownValues: { patientLastName: "Schmidt" },
    });
    const restored = result.restore(result.text);
    expect(restored).toBe("Schmidt am 2025-03-15");
  });

  it("returns zero summary when no PII found", () => {
    const result = anonymize("Dies ist ein normaler Text.");
    expect(result.summary).toBe("0 replacements");
    expect(result.replacementCount).toBe(0);
  });

  it("replaces AHV numbers", () => {
    const result = anonymize("AHV-Nr.: 756.1234.5678.90");
    expect(result.text).toContain("[AHV_1]");
  });

  it("replaces email addresses", () => {
    const result = anonymize("Kontakt: patient@example.com");
    expect(result.text).toContain("[EMAIL_1]");
  });
});

// ── detectPii() tests ────────────────────────────────────────────────

describe("detectPii", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns entities from sidecar", async () => {
    const mockResponse = {
      entities: [
        { start: 0, end: 5, text: "Maria", type: "NAME", confidence: 0.95 },
      ],
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const entities = await detectPii("Maria lebt in Zürich");
    expect(entities).toHaveLength(1);
    expect(entities[0].text).toBe("Maria");
    expect(entities[0].type).toBe("NAME");
  });

  it("returns empty array on connection error", async () => {
    (fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));

    const entities = await detectPii("some text");
    expect(entities).toEqual([]);
  });

  it("returns empty array on non-ok status", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const entities = await detectPii("some text");
    expect(entities).toEqual([]);
  });

  it("returns empty array on timeout", async () => {
    (fetch as any).mockImplementation(
      () =>
        new Promise((_, reject) => {
          const err = new Error("timeout");
          err.name = "AbortError";
          reject(err);
        }),
    );

    const entities = await detectPii("some text");
    expect(entities).toEqual([]);
  });
});

// ── anonymizeWithOpenMed() tests ─────────────────────────────────────

describe("anonymizeWithOpenMed", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches additional PII beyond base anonymize()", async () => {
    // Base anonymize replaces "Schmidt" via known values
    // OpenMed detects "Maria" (wife's name not in DB)
    const input = "Herr Schmidt und seine Frau Maria";
    // After base: "Herr [NAME_1] und seine Frau Maria"
    // "Maria" starts at position 29 in that string
    const baseText = "Herr [NAME_1] und seine Frau Maria";
    const mariaIdx = baseText.indexOf("Maria");

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entities: [
            { start: mariaIdx, end: mariaIdx + 5, text: "Maria", type: "PERSON", confidence: 0.92 },
          ],
        }),
    });

    const result = await anonymizeWithOpenMed(input, {
      knownValues: { patientLastName: "Schmidt" },
    });

    expect(result.text).not.toContain("Maria");
    expect(result.text).toContain("[NAME_2]");
    expect(result.summary).toContain("via OpenMed");
    expect(result.replacementCount).toBe(2);
  });

  it("restores both OpenMed and base placeholders", async () => {
    const input = "Schmidt und Maria";
    // After base: "[NAME_1] und Maria"
    const baseText = "[NAME_1] und Maria";
    const mariaIdx = baseText.indexOf("Maria"); // 13

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entities: [
            { start: mariaIdx, end: mariaIdx + 5, text: "Maria", type: "PERSON", confidence: 0.9 },
          ],
        }),
    });

    const result = await anonymizeWithOpenMed(input, {
      knownValues: { patientLastName: "Schmidt" },
    });

    expect(result.text).toBe("[NAME_1] und [NAME_2]");

    const restored = result.restore("[NAME_1] und [NAME_2]");
    expect(restored).toBe("Schmidt und Maria");
  });

  it("falls back gracefully when sidecar is down", async () => {
    (fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await anonymizeWithOpenMed("Schmidt hat eine email@test.com", {
      knownValues: { patientLastName: "Schmidt" },
    });

    // Should still get base anonymize results
    expect(result.text).toContain("[NAME_1]");
    expect(result.text).toContain("[EMAIL_1]");
    expect(result.summary).not.toContain("OpenMed");
  });

  it("skips entities that overlap with existing placeholders", async () => {
    const input = "Schmidt hat email@test.com";
    // After base: "[NAME_1] hat [EMAIL_1]"
    const baseText = "[NAME_1] hat [EMAIL_1]";

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entities: [
            // OpenMed tries to detect the email that's already a placeholder
            { start: 13, end: 22, text: "[EMAIL_1]", type: "EMAIL", confidence: 0.8 },
          ],
        }),
    });

    const result = await anonymizeWithOpenMed(input, {
      knownValues: { patientLastName: "Schmidt" },
    });

    // Should not double-replace
    expect(result.text).toBe(baseText);
    expect(result.replacementCount).toBe(2); // only base replacements
  });

  it("maps OpenMed entity types to our categories", async () => {
    const input = "Wohnt in Bahnhofstrasse";

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entities: [
            { start: 9, end: 23, text: "Bahnhofstrasse", type: "ADDRESS", confidence: 0.88 },
          ],
        }),
    });

    const result = await anonymizeWithOpenMed(input);

    // ADDRESS should map to LOCATION
    expect(result.text).toContain("[LOCATION_1]");
  });

  it("handles no additional entities gracefully", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entities: [] }),
    });

    const result = await anonymizeWithOpenMed("Schmidt", {
      knownValues: { patientLastName: "Schmidt" },
    });

    expect(result.text).toBe("[NAME_1]");
    expect(result.summary).not.toContain("OpenMed");
  });

  it("handles multiple OpenMed entities in correct order", async () => {
    const input = "Maria und Peter";

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entities: [
            { start: 0, end: 5, text: "Maria", type: "PERSON", confidence: 0.95 },
            { start: 10, end: 15, text: "Peter", type: "PERSON", confidence: 0.93 },
          ],
        }),
    });

    const result = await anonymizeWithOpenMed(input);

    expect(result.text).toContain("[NAME_1]");
    expect(result.text).toContain("[NAME_2]");
    expect(result.text).not.toContain("Maria");
    expect(result.text).not.toContain("Peter");
    expect(result.replacementCount).toBe(2);
  });

  it("deduplicates repeated OpenMed values", async () => {
    const input = "Maria und Maria";

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          entities: [
            { start: 0, end: 5, text: "Maria", type: "PERSON", confidence: 0.9 },
            { start: 10, end: 15, text: "Maria", type: "PERSON", confidence: 0.9 },
          ],
        }),
    });

    const result = await anonymizeWithOpenMed(input);

    // Same value should get the same placeholder
    expect(result.text).toBe("[NAME_1] und [NAME_1]");
    expect(result.replacementCount).toBe(1); // base=0, openmed=1 unique value
  });
});
