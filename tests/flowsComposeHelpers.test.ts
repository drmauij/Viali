import { describe, it, expect } from "vitest";
import {
  buildSnippetEditUserMessage,
  SNIPPET_EDIT_SYSTEM_PROMPT,
} from "../server/routes/flowsComposeHelpers";

describe("buildSnippetEditUserMessage", () => {
  it("includes brand head, element snippet, and instruction in that order", () => {
    const msg = buildSnippetEditUserMessage(
      "<style>body{color:red}</style>",
      `<p data-vai-marker="m1">old</p>`,
      "make it warmer",
    );
    expect(msg.indexOf("Brand reference")).toBeLessThan(msg.indexOf("Element to edit"));
    expect(msg.indexOf("Element to edit")).toBeLessThan(msg.indexOf("Instruction"));
    expect(msg).toContain("<style>body{color:red}</style>");
    expect(msg).toContain(`data-vai-marker="m1"`);
    expect(msg).toContain("make it warmer");
  });

  it("trims a giant brand head to 3000 chars", () => {
    const big = "x".repeat(10000);
    const msg = buildSnippetEditUserMessage(big, "<p>x</p>", "do thing");
    // Brand head section content (between header and next blank line) must be <= 3000.
    const headStart = msg.indexOf("Brand reference (head):\n") + "Brand reference (head):\n".length;
    const headEnd = msg.indexOf("\n\nElement to edit:");
    expect(headEnd - headStart).toBeLessThanOrEqual(3000);
  });
});

describe("SNIPPET_EDIT_SYSTEM_PROMPT", () => {
  it("requires a single root and forbids markdown fences", () => {
    expect(SNIPPET_EDIT_SYSTEM_PROMPT).toMatch(/single root|exactly ONE/i);
    expect(SNIPPET_EDIT_SYSTEM_PROMPT).toMatch(/no markdown/i);
  });

  it("instructs to preserve the marker and template variables", () => {
    expect(SNIPPET_EDIT_SYSTEM_PROMPT).toMatch(/data-vai-marker/);
    expect(SNIPPET_EDIT_SYSTEM_PROMPT).toMatch(/buchungslink/);
  });
});
