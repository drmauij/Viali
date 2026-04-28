// tests/contractTemplates/resolveText.test.ts
import { describe, it, expect } from "vitest";
import { resolveText } from "@shared/contractTemplates/resolveText";

describe("resolveText", () => {
  it("replaces simple variable references", () => {
    expect(resolveText("Hello {{name}}", { name: "Anna" })).toBe("Hello Anna");
  });

  it("resolves nested dotted paths", () => {
    expect(resolveText("IBAN: {{worker.iban}}", { worker: { iban: "CH123" } })).toBe("IBAN: CH123");
  });

  it("returns empty string for missing keys", () => {
    expect(resolveText("Foo {{a.b.c}}", {})).toBe("Foo ");
  });

  it("ignores non-template double braces in adjacent text", () => {
    expect(resolveText("This {{ is fine }} actually", { foo: "bar" })).toBe("This {{ is fine }} actually");
  });

  it("replaces multiple occurrences", () => {
    expect(resolveText("{{a}} and {{a}} again", { a: "x" })).toBe("x and x again");
  });

  it("stringifies numbers", () => {
    expect(resolveText("Rate: {{rate}}", { rate: 50 })).toBe("Rate: 50");
  });
});
