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

// Mock node:dns/promises so tests can simulate the SSRF guard without
// actually hitting DNS. Hostnames used in tests:
//   real.example.test    → 8.8.8.8 (public, allowed)
//   evil.example.test    → 169.254.169.254 (link-local, rejected)
//   nxdomain.example.test → ENOTFOUND (rejected)
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === "evil.example.test") {
      return [{ address: "169.254.169.254", family: 4 }];
    }
    if (host === "real.example.test") {
      return [{ address: "8.8.8.8", family: 4 }];
    }
    throw new Error("ENOTFOUND");
  }),
}));

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
    const result = await extractThemeFromUrl("https://real.example.test");
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
    await expect(extractThemeFromUrl("https://real.example.test")).rejects.toThrow(/anthropic/i);
  });

  it("rejects malformed JSON from Claude", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "not json" }] }),
    });
    await expect(extractThemeFromUrl("https://real.example.test")).rejects.toThrow(/parse/i);
  });

  it("rejects localhost", async () => {
    await expect(extractThemeFromUrl("http://localhost/")).rejects.toThrow(/internal/i);
  });

  it("rejects .local hostnames", async () => {
    await expect(extractThemeFromUrl("http://router.local/")).rejects.toThrow(/internal/i);
  });

  it("rejects .internal hostnames", async () => {
    await expect(extractThemeFromUrl("http://db.internal/")).rejects.toThrow(/internal/i);
  });

  it("rejects link-local IP via DNS (cloud metadata)", async () => {
    // 169.254.169.254 is the AWS/GCP metadata IP — rejected because the
    // mocked DNS lookup resolves evil.example.test to it.
    await expect(extractThemeFromUrl("http://evil.example.test/")).rejects.toThrow(/private or reserved/i);
  });

  it("rejects direct IP literal targeting cloud metadata", async () => {
    // No DNS needed — the IP literal is checked directly.
    await expect(extractThemeFromUrl("http://169.254.169.254/")).rejects.toThrow(/private or reserved/i);
  });

  it("rejects RFC1918 IP literals", async () => {
    await expect(extractThemeFromUrl("http://10.0.0.1/")).rejects.toThrow(/private or reserved/i);
    await expect(extractThemeFromUrl("http://192.168.1.1/")).rejects.toThrow(/private or reserved/i);
    await expect(extractThemeFromUrl("http://172.16.0.1/")).rejects.toThrow(/private or reserved/i);
  });

  it("rejects loopback IPv6", async () => {
    await expect(extractThemeFromUrl("http://[::1]/")).rejects.toThrow(/private or reserved/i);
  });

  it("rejects hostnames that don't resolve", async () => {
    await expect(extractThemeFromUrl("http://nxdomain.example.test/")).rejects.toThrow(/did not resolve/i);
  });
});
