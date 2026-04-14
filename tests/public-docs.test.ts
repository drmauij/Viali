import { describe, it, expect } from "vitest";
import { LLMS_TXT, llmsTxtHandler } from "../server/routes/publicDocs";

describe("llms.txt", () => {
  it("starts with the Viali API heading", () => {
    expect(LLMS_TXT.startsWith("# Viali API")).toBe(true);
  });

  it("includes links to the four docs sections", () => {
    expect(LLMS_TXT).toContain("/api)");
    expect(LLMS_TXT).toContain("/api#leads-webhook");
    expect(LLMS_TXT).toContain("/api#conversions-api");
    expect(LLMS_TXT).toContain("/api#booking-link");
  });

  it("describes the per-hospital API key auth model", () => {
    expect(LLMS_TXT).toContain("Per-hospital API keys");
    expect(LLMS_TXT).toContain("?key=");
  });

  it("does not leak UUIDs or hex tokens", () => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const longHex = /\b[0-9a-f]{32,}\b/i;
    expect(LLMS_TXT).not.toMatch(uuid);
    expect(LLMS_TXT).not.toMatch(longHex);
  });

  it("handler writes text/plain with the content", () => {
    let setType = "";
    let sent = "";
    const req = {} as any;
    const res = {
      type(t: string) { setType = t; return this; },
      send(body: string) { sent = body; return this; },
    } as any;
    llmsTxtHandler(req, res);
    expect(setType).toBe("text/plain; charset=utf-8");
    expect(sent).toBe(LLMS_TXT);
  });
});
