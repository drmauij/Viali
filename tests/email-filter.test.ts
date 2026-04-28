import { describe, it, expect } from "vitest";
import { isValidWorkerEmail } from "../server/lib/emailFilter";

describe("isValidWorkerEmail", () => {
  it("accepts a normal email", () => {
    expect(isValidWorkerEmail("alice@example.com")).toBe(true);
  });

  it("rejects null and undefined", () => {
    expect(isValidWorkerEmail(null)).toBe(false);
    expect(isValidWorkerEmail(undefined)).toBe(false);
  });

  it("rejects empty and whitespace strings", () => {
    expect(isValidWorkerEmail("")).toBe(false);
    expect(isValidWorkerEmail("   ")).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(isValidWorkerEmail("alice")).toBe(false);
    expect(isValidWorkerEmail("alice@")).toBe(false);
    expect(isValidWorkerEmail("@example.com")).toBe(false);
    expect(isValidWorkerEmail("alice@@example.com")).toBe(false);
    expect(isValidWorkerEmail("alice@example")).toBe(false);
    expect(isValidWorkerEmail("alice example@x.com")).toBe(false);
  });

  it("rejects emails containing .local (case-insensitive)", () => {
    expect(isValidWorkerEmail("nurse@hospital.local")).toBe(false);
    expect(isValidWorkerEmail("nurse@hospital.LOCAL")).toBe(false);
    expect(isValidWorkerEmail("alice@example.local.org")).toBe(false);
    expect(isValidWorkerEmail("alice@local.example.com")).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidWorkerEmail("  alice@example.com  ")).toBe(true);
  });
});
