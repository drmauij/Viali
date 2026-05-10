// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  type SurgerySnapshot,
} from "../client/src/lib/surgeon-portal-draft";

const TOKEN = "tok-1";
const EMAIL = "Surgeon@Example.COM";

const baseValues: SurgerySnapshot = {
  surgeryName: "Test",
} as unknown as SurgerySnapshot;

describe("surgeon-portal-draft", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("save → load round trip", () => {
    saveDraft(TOKEN, EMAIL, baseValues);
    const loaded = loadDraft(TOKEN, EMAIL);
    expect(loaded).not.toBeNull();
    expect(loaded!.values).toEqual(baseValues);
    expect(loaded!.version).toBe(1);
    expect(typeof loaded!.savedAt).toBe("string");
  });

  it("scopes by token + email (case-insensitive email)", () => {
    saveDraft(TOKEN, EMAIL, baseValues);
    expect(loadDraft(TOKEN, "surgeon@example.com")).not.toBeNull();
    expect(loadDraft("other-tok", EMAIL)).toBeNull();
    expect(loadDraft(TOKEN, "other@example.com")).toBeNull();
  });

  it("clearDraft removes the entry", () => {
    saveDraft(TOKEN, EMAIL, baseValues);
    clearDraft(TOKEN, EMAIL);
    expect(loadDraft(TOKEN, EMAIL)).toBeNull();
  });

  it("returns null and deletes the entry when older than 7 days", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const stale = JSON.stringify({ savedAt: eightDaysAgo, version: 1, values: baseValues });
    localStorage.setItem(
      `viali.surgeon-portal.draft.${TOKEN}.${EMAIL.toLowerCase()}`,
      stale,
    );
    expect(loadDraft(TOKEN, EMAIL)).toBeNull();
    expect(
      localStorage.getItem(`viali.surgeon-portal.draft.${TOKEN}.${EMAIL.toLowerCase()}`),
    ).toBeNull();
  });

  it("returns null on version mismatch", () => {
    const futureVersion = JSON.stringify({
      savedAt: new Date().toISOString(),
      version: 99,
      values: baseValues,
    });
    localStorage.setItem(
      `viali.surgeon-portal.draft.${TOKEN}.${EMAIL.toLowerCase()}`,
      futureVersion,
    );
    expect(loadDraft(TOKEN, EMAIL)).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    const original = global.localStorage;
    Object.defineProperty(global, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage disabled");
      },
    });
    try {
      expect(() => saveDraft(TOKEN, EMAIL, baseValues)).not.toThrow();
      expect(loadDraft(TOKEN, EMAIL)).toBeNull();
      expect(() => clearDraft(TOKEN, EMAIL)).not.toThrow();
    } finally {
      Object.defineProperty(global, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
