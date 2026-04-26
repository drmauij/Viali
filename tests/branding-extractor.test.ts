import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock playwright so the test never launches a real browser.
vi.mock("playwright", () => {
  return {
    chromium: {
      launch: vi.fn(async () => ({
        newContext: vi.fn(async () => ({
          newPage: vi.fn(async () => ({
            goto: vi.fn(),
            waitForTimeout: vi.fn(),
            screenshot: vi.fn(async () => Buffer.from("fake-screenshot")),
            content: vi.fn(async () => "<html><body><h1>Beauty2Go</h1></body></html>"),
          })),
        })),
        close: vi.fn(),
      })),
    },
  };
});

const fetchMock = vi.fn();
global.fetch = fetchMock as any;

import { extractThemeFromUrl } from "../server/services/brandingExtractor";

beforeEach(() => {
  fetchMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("brandingExtractor", () => {
  it("returns parsed theme on success", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify({
          bgColor: "#fafafa",
          primaryColor: "#c89b6b",
          secondaryColor: "#4a3727",
          headingFont: "Avenir Next",
          bodyFont: "Avenir Next",
        }) }],
      }),
    });
    const result = await extractThemeFromUrl("https://example.com");
    expect(result.bgColor).toBe("#fafafa");
    expect(result.primaryColor).toBe("#c89b6b");
    expect(["Inter","Roboto","Open Sans","Lato","Source Sans 3","Nunito Sans","Work Sans","DM Sans","IBM Plex Sans","Manrope"]).toContain(result.bodyFont);
    expect(result.sourceFont?.body).toBe("Avenir Next");
  });

  it("rejects non-http URLs", async () => {
    await expect(extractThemeFromUrl("javascript:alert(1)")).rejects.toThrow(/invalid url/i);
  });

  it("propagates Anthropic API errors", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    await expect(extractThemeFromUrl("https://example.com")).rejects.toThrow(/anthropic/i);
  });

  it("rejects malformed JSON from Claude", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "not json" }] }),
    });
    await expect(extractThemeFromUrl("https://example.com")).rejects.toThrow(/parse/i);
  });
});
