# Flows HTML newsletter — click-to-select + AI edit (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the contract-template editor's "click an element in the preview, AI edits only that element" UX to the `/business/flows` HTML email composer.

**Architecture:** Pure-function utilities (`htmlEditScope.ts`) compute a DOM path for the clicked element and inject a marker attribute into the source HTML; the frontend POSTs the marked element's outerHTML + the email's `<head>` (brand context) to `/flows/compose`; a new short-circuit branch in the existing route asks Claude for just the replacement element; the frontend splices it back. Click handling lives in a new `HtmlPreviewIframe` component that injects styles into and attaches listeners on the iframe's `contentDocument` (sandbox stays `allow-same-origin`, no scripts).

**Tech Stack:** TypeScript, React, Vitest (`// @vitest-environment jsdom` for DOM tests, `jsdom` already in deps), Express + Zod on the backend, Anthropic Messages API (`claude-sonnet-4-20250514`, non-streaming for snippet edits).

**Spec:** `docs/superpowers/specs/2026-04-28-flows-html-click-to-edit-design.md`

---

## File Structure

| File | Purpose |
|---|---|
| `client/src/lib/htmlEditScope.ts` *(new, ~120 lines)* | Pure utilities — `computeDomPath`, `markElementByPath`, `replaceMarkedElement`, `stripMarkers`, `extractHeadContent` |
| `tests/htmlEditScope.test.ts` *(new)* | Unit tests for the utilities, jsdom env |
| `client/src/components/flows/HtmlPreviewIframe.tsx` *(new, ~110 lines)* | Iframe + style/listener injection + selection-outline rendering |
| `client/src/components/flows/MessageComposer.tsx` | Add selection state, scope chip, route clicks to setSelection, snippet-path send, undo, replace existing inline iframes with `HtmlPreviewIframe` |
| `server/routes/flows.ts` | Extend `composeSchema` with `selectedSnippet` + `brandHead`, short-circuit branch when `selectedSnippet` is set |
| `server/routes/flowsComposeHelpers.ts` *(new, small)* | Extract a pure `buildSnippetEditUserMessage(brandHead, snippet, prompt)` so the prompt assembly is testable without stubbing `fetch` |
| `tests/flowsComposeHelpers.test.ts` *(new)* | Unit tests for the prompt builder + schema |

The `htmlEditScope.ts` module is intentionally framework-free — pure string/DOM functions. The `HtmlPreviewIframe` component owns all iframe wiring so `MessageComposer` doesn't grow more glue code than necessary.

---

## Task 1: `computeDomPath` and `htmlEditScope.ts` skeleton

**Files:**
- Create: `client/src/lib/htmlEditScope.ts`
- Create: `tests/htmlEditScope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/htmlEditScope.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeDomPath } from "@/lib/htmlEditScope";

describe("computeDomPath", () => {
  it("returns the index path of an element relative to a root", () => {
    const root = document.createElement("body");
    root.innerHTML = `
      <div>
        <p>first</p>
        <p>second</p>
        <ul>
          <li>a</li>
          <li id="target">b</li>
        </ul>
      </div>
    `;
    const target = root.querySelector("#target")!;
    expect(computeDomPath(target, root)).toEqual([0, 2, 1]);
  });

  it("returns [] for the root itself", () => {
    const root = document.createElement("body");
    root.innerHTML = "<p>x</p>";
    expect(computeDomPath(root, root)).toEqual([]);
  });

  it("ignores text nodes (only counts element children)", () => {
    const root = document.createElement("body");
    // Whitespace text nodes between elements would shift indices if counted.
    root.innerHTML = "<p>a</p>   <p>b</p>   <p id=\"t\">c</p>";
    const target = root.querySelector("#t")!;
    expect(computeDomPath(target, root)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: FAIL — `Cannot find module '@/lib/htmlEditScope'` (module not yet created).

- [ ] **Step 3: Implement `computeDomPath`**

Create `client/src/lib/htmlEditScope.ts`:

```ts
/**
 * Compute the index path of an element relative to a root.
 * Each step is the index among ELEMENT children of the parent (text/comment
 * nodes are ignored). The path can be replayed against another DOM built
 * from the same source HTML to find the corresponding element.
 */
export function computeDomPath(el: Element, root: Element): number[] {
  const path: number[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    const parent = node.parentElement;
    if (!parent) return [];
    const idx = Array.from(parent.children).indexOf(node);
    if (idx < 0) return [];
    path.unshift(idx);
    node = parent;
  }
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/htmlEditScope.ts tests/htmlEditScope.test.ts
git commit -m "feat(flows): htmlEditScope.computeDomPath"
```

---

## Task 2: `markElementByPath`

**Files:**
- Modify: `client/src/lib/htmlEditScope.ts`
- Modify: `tests/htmlEditScope.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/htmlEditScope.test.ts`:

```ts
import { markElementByPath } from "@/lib/htmlEditScope";

describe("markElementByPath", () => {
  const html = `<!DOCTYPE html><html><head><title>t</title></head><body><div><p>one</p><p>two</p></div></body></html>`;

  it("injects a data-vai-marker attribute and returns the marked element", () => {
    const out = markElementByPath(html, [0, 1])!;
    expect(out.markerId).toMatch(/^[a-z0-9]+$/);
    expect(out.snippet).toMatch(/^<p [^>]*data-vai-marker="[^"]+"[^>]*>two<\/p>$/);
    expect(out.markedHtml).toContain(`data-vai-marker="${out.markerId}"`);
    // The other paragraph stays untouched.
    expect(out.markedHtml).toMatch(/<p>one<\/p>/);
  });

  it("returns null for an invalid path", () => {
    expect(markElementByPath(html, [99])).toBeNull();
    expect(markElementByPath(html, [0, 99])).toBeNull();
    expect(markElementByPath(html, [])).toBeNull();
  });

  it("walks tbody auto-inserted by the parser", () => {
    // Mirror what browsers do: <table><tr> auto-inserts a <tbody>.
    const tableHtml = `<!DOCTYPE html><html><body><table><tr><td>x</td></tr></table></body></html>`;
    // body > table > tbody > tr > td
    const out = markElementByPath(tableHtml, [0, 0, 0, 0])!;
    expect(out.snippet).toMatch(/^<td [^>]*data-vai-marker=/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: FAIL — `markElementByPath is not exported`.

- [ ] **Step 3: Implement `markElementByPath`**

Append to `client/src/lib/htmlEditScope.ts`:

```ts
/**
 * Parse `html`, walk the path from <body>, inject `data-vai-marker="<id>"`
 * on the matching element, and return:
 *   - `markedHtml`: full document serialization with the attribute in place
 *   - `markerId`:    the id we injected (random, URL-safe)
 *   - `snippet`:     the marked element's outerHTML
 *
 * Returns `null` if the path is empty or doesn't resolve.
 */
export function markElementByPath(
  html: string,
  path: number[],
): { markedHtml: string; markerId: string; snippet: string } | null {
  if (path.length === 0) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let node: Element | null = doc.body;
  for (const idx of path) {
    if (!node) return null;
    const child = node.children[idx];
    if (!child) return null;
    node = child;
  }
  if (!node || node === doc.body) return null;
  const markerId = randomId();
  node.setAttribute("data-vai-marker", markerId);
  const snippet = node.outerHTML;
  const markedHtml = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  return { markedHtml, markerId, snippet };
}

function randomId(): string {
  // 9 chars of base36 — collision-free per request, no crypto dep needed.
  return Math.random().toString(36).slice(2, 11);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: PASS, 6 tests total.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/htmlEditScope.ts tests/htmlEditScope.test.ts
git commit -m "feat(flows): htmlEditScope.markElementByPath"
```

---

## Task 3: `replaceMarkedElement`

**Files:**
- Modify: `client/src/lib/htmlEditScope.ts`
- Modify: `tests/htmlEditScope.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/htmlEditScope.test.ts`:

```ts
import { replaceMarkedElement } from "@/lib/htmlEditScope";

describe("replaceMarkedElement", () => {
  it("replaces the marked element with the given replacement HTML", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p>one</p><p data-vai-marker="abc123">old</p><p>three</p></body></html>`;
    const out = replaceMarkedElement(markedHtml, "abc123", `<p>NEW</p>`);
    expect(out).toContain("<p>one</p>");
    expect(out).toContain("<p>NEW</p>");
    expect(out).toContain("<p>three</p>");
    expect(out).not.toContain("old");
    expect(out).not.toContain("abc123");
  });

  it("strips markdown fences from the replacement", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p data-vai-marker="m1">old</p></body></html>`;
    const fenced = "```html\n<p>NEW</p>\n```";
    const out = replaceMarkedElement(markedHtml, "m1", fenced);
    expect(out).toContain("<p>NEW</p>");
    expect(out).not.toContain("```");
  });

  it("returns the original markedHtml unchanged if the marker is not found", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p>one</p></body></html>`;
    expect(replaceMarkedElement(markedHtml, "missing", "<p>x</p>")).toBe(markedHtml);
  });

  it("throws on a multi-root replacement (caller should toast and revert)", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p data-vai-marker="m1">old</p></body></html>`;
    expect(() =>
      replaceMarkedElement(markedHtml, "m1", "<p>a</p><p>b</p>"),
    ).toThrow(/single root/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: FAIL — `replaceMarkedElement is not exported`.

- [ ] **Step 3: Implement `replaceMarkedElement`**

Append to `client/src/lib/htmlEditScope.ts`:

```ts
/**
 * Find the element with `data-vai-marker="<markerId>"` in `markedHtml` and
 * replace its outerHTML with `replacement`. The replacement is first stripped
 * of markdown code fences (Claude sometimes adds them). Throws if the
 * replacement parses to anything other than exactly one root element. Returns
 * `markedHtml` unchanged if the marker is not found (caller logs / toasts).
 */
export function replaceMarkedElement(
  markedHtml: string,
  markerId: string,
  replacement: string,
): string {
  const cleaned = stripMarkdownFences(replacement).trim();
  if (!cleaned) throw new Error("replacement is empty");

  // Validate single-root: parse in a fresh template and count element children.
  const tpl = document.createElement("template");
  tpl.innerHTML = cleaned;
  const roots = tpl.content.children;
  if (roots.length !== 1) {
    throw new Error(`replacement must be a single root element, got ${roots.length}`);
  }

  const doc = new DOMParser().parseFromString(markedHtml, "text/html");
  const target = doc.querySelector(`[data-vai-marker="${cssEscape(markerId)}"]`);
  if (!target) return markedHtml;

  // Replace via outerHTML on the original element.
  target.outerHTML = cleaned;
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

function stripMarkdownFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html|HTML)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "");
}

function cssEscape(s: string): string {
  // Marker ids are base36 — no special chars — but be defensive.
  return s.replace(/["\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: PASS, 10 tests total.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/htmlEditScope.ts tests/htmlEditScope.test.ts
git commit -m "feat(flows): htmlEditScope.replaceMarkedElement"
```

---

## Task 4: `stripMarkers` and `extractHeadContent`

**Files:**
- Modify: `client/src/lib/htmlEditScope.ts`
- Modify: `tests/htmlEditScope.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/htmlEditScope.test.ts`:

```ts
import { stripMarkers, extractHeadContent } from "@/lib/htmlEditScope";

describe("stripMarkers", () => {
  it("removes data-vai-marker attributes from any tag", () => {
    const html = `<p data-vai-marker="a1">one</p><div data-vai-marker='b2'>two</div>`;
    const out = stripMarkers(html);
    expect(out).not.toContain("data-vai-marker");
    expect(out).toContain("<p>one</p>");
    expect(out).toContain("<div>two</div>");
  });

  it("leaves HTML without markers untouched", () => {
    const html = `<p class="x">y</p>`;
    expect(stripMarkers(html)).toBe(html);
  });
});

describe("extractHeadContent", () => {
  it("returns the inner of <head>", () => {
    const html = `<!DOCTYPE html><html><head><style>body{color:red}</style><title>x</title></head><body>z</body></html>`;
    const head = extractHeadContent(html);
    expect(head).toContain("<style>body{color:red}</style>");
    expect(head).toContain("<title>x</title>");
    expect(head).not.toContain("<body>");
  });

  it("returns an empty string when there is no <head>", () => {
    expect(extractHeadContent("<p>hi</p>")).toBe("");
  });

  it("trims to a max byte length", () => {
    const big = "x".repeat(10000);
    const html = `<html><head><style>${big}</style></head><body></body></html>`;
    expect(extractHeadContent(html).length).toBeLessThanOrEqual(3000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: FAIL — `stripMarkers / extractHeadContent are not exported`.

- [ ] **Step 3: Implement both helpers**

Append to `client/src/lib/htmlEditScope.ts`:

```ts
/** Remove every `data-vai-marker="..."` (and `data-vai-marker='...'`) attribute. */
export function stripMarkers(html: string): string {
  // Safe regex: we only target our own attribute name, never user content.
  return html.replace(/\s+data-vai-marker=("[^"]*"|'[^']*')/g, "");
}

/**
 * Return the inner of `<head>` from an HTML document, trimmed to ~3 kB.
 * Used as brand context for the AI snippet-edit prompt — preserves CSS,
 * fonts, and palette without paying for the full body.
 */
export function extractHeadContent(html: string, maxLen = 3000): string {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!m) return "";
  return m[1].slice(0, maxLen);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/htmlEditScope.test.ts`
Expected: PASS, 15 tests total.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/htmlEditScope.ts tests/htmlEditScope.test.ts
git commit -m "feat(flows): htmlEditScope.stripMarkers + extractHeadContent"
```

---

## Task 5: Backend snippet-edit branch

**Files:**
- Create: `server/routes/flowsComposeHelpers.ts`
- Create: `tests/flowsComposeHelpers.test.ts`
- Modify: `server/routes/flows.ts`

- [ ] **Step 1: Write the failing test for the prompt builder**

Create `tests/flowsComposeHelpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flowsComposeHelpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers module**

Create `server/routes/flowsComposeHelpers.ts`:

```ts
export const SNIPPET_EDIT_SYSTEM_PROMPT = `You are editing ONE element of an HTML email newsletter.

You will receive:
1. The current outerHTML of the element (with a data-vai-marker attribute).
2. The email's <head> for brand reference (CSS, fonts, palette).
3. The user's instruction.

Return ONLY the replacement outerHTML for that single element. Rules:
- Output exactly ONE root element. No prose, no markdown fences, no <html>/<head>/<body>.
- Preserve the data-vai-marker attribute on the root element verbatim.
- Match the brand's existing CSS — same color palette, same font stack, same spacing scale.
- Keep all template variables ({{vorname}}, {{nachname}}, {{behandlung}}, {{buchungslink}}) intact unless the user explicitly asks to change them.
- Use ONLY inline styles (email-safe).
- Do not change the element's tag unless the instruction explicitly requires it.`;

export function buildSnippetEditUserMessage(
  brandHead: string,
  selectedSnippet: string,
  prompt: string,
): string {
  return [
    `Brand reference (head):\n${(brandHead || "").slice(0, 3000)}`,
    `Element to edit:\n${selectedSnippet}`,
    `Instruction:\n${prompt}`,
  ].join("\n\n");
}

export function stripMarkdownFencesServer(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html|HTML)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flowsComposeHelpers.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Extend the compose schema**

In `server/routes/flows.ts`, find `composeSchema` (around line 706) and add the two optional fields:

```ts
const composeSchema = z.object({
  channel: z.enum(["sms", "email", "html_email"]),
  prompt: z.string().optional().default(""),
  segmentDescription: z.string().optional(),
  hospitalName: z.string().optional(),
  bookingUrl: z.string().optional(),
  promoCode: z.string().nullable().optional(),
  referenceUrl: z.string().optional(),
  abVariantOf: z.string().optional(),
  abStyleHint: z.string().optional(),
  preserveCopy: z.boolean().optional(),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  // ── NEW: single-element scoped edit ──
  selectedSnippet: z.string().optional(),
  brandHead: z.string().optional(),
});
```

- [ ] **Step 6: Add the snippet-edit branch**

In `server/routes/flows.ts`, find the line that begins the html_email streaming path (around line 1140: `if (body.channel === "html_email" && ANTHROPIC_API_KEY && !body.abVariantOf) {`). Add the snippet-edit branch IMMEDIATELY ABOVE it:

```ts
import {
  SNIPPET_EDIT_SYSTEM_PROMPT,
  buildSnippetEditUserMessage,
  stripMarkdownFencesServer,
} from "./flowsComposeHelpers";

// ... inside the handler, before the streaming branch:

if (body.channel === "html_email" && body.selectedSnippet && ANTHROPIC_API_KEY) {
  const userMessage = buildSnippetEditUserMessage(
    body.brandHead || "",
    body.selectedSnippet,
    body.prompt || "",
  );
  logger.info(
    `[flows] compose snippet-edit: snippet=${body.selectedSnippet.length}b, head=${(body.brandHead || "").length}b`
  );
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: SNIPPET_EDIT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    logger.error(`[flows] snippet-edit Anthropic ${resp.status}: ${errText.slice(0, 500)}`);
    return res.status(502).json({ error: `Anthropic API ${resp.status}` });
  }
  const data = (await resp.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("");
  const replacementSnippet = stripMarkdownFencesServer(raw);
  return res.json({ replacementSnippet });
}
```

(Place the three new imports near the top of `server/routes/flows.ts` alongside the other route-relative imports.)

- [ ] **Step 7: Typecheck**

Run: `npm run check`
Expected: PASS, no new errors.

- [ ] **Step 8: Commit**

```bash
git add server/routes/flowsComposeHelpers.ts tests/flowsComposeHelpers.test.ts server/routes/flows.ts
git commit -m "feat(flows): backend snippet-edit branch in /flows/compose"
```

---

## Task 6: `HtmlPreviewIframe` component

**Files:**
- Create: `client/src/components/flows/HtmlPreviewIframe.tsx`

This component owns iframe wiring for both single and split-preview cases. It accepts:
- `html: string` — what to render in `srcDoc`
- `selectable: boolean` — when false, behaves as a passive preview (used when no selection is wanted, e.g. inactive variants)
- `selectedPath: number[] | null` — apply `data-vai-selected` to the element at this path on each load
- `onElementClick?: (path: number[]) => void` — fired with the element path when the user clicks a whitelisted element
- `onBackgroundClick?: () => void` — fired when the user clicks an unselectable area
- `className?: string`, `style?: CSSProperties` — passthrough for layout

- [ ] **Step 1: Implement the component**

Create `client/src/components/flows/HtmlPreviewIframe.tsx`:

```tsx
import { useEffect, useRef, type CSSProperties } from "react";
import { computeDomPath } from "@/lib/htmlEditScope";

const SELECTABLE_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "LI", "A", "BUTTON", "IMG", "BLOCKQUOTE",
]);

const STYLE_BLOCK = `
[data-vai-hover] { outline: 2px dashed #94a3b8 !important; outline-offset: 2px; cursor: pointer; }
[data-vai-selected] { outline: 2px solid #3b82f6 !important; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(59,130,246,0.2); }
`;

function findSelectableAncestor(start: Element, root: Element): Element | null {
  let n: Element | null = start;
  while (n && n !== root) {
    if (SELECTABLE_TAGS.has(n.tagName)) return n;
    n = n.parentElement;
  }
  return null;
}

function pathToElement(root: Element, path: number[]): Element | null {
  let n: Element | null = root;
  for (const idx of path) {
    if (!n) return null;
    n = n.children[idx] || null;
  }
  return n;
}

interface Props {
  html: string;
  selectable: boolean;
  selectedPath: number[] | null;
  onElementClick?: (path: number[]) => void;
  onBackgroundClick?: () => void;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function HtmlPreviewIframe({
  html,
  selectable,
  selectedPath,
  onElementClick,
  onBackgroundClick,
  className,
  style,
  title = "HTML preview",
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Wrap fragments so a partial AI stream still parses; full docs pass through.
  const looksLikeFullDoc = /^\s*(<!DOCTYPE|<html[\s>])/i.test(html);
  const srcDoc = html
    ? looksLikeFullDoc
      ? html
      : `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">${html}</body></html>`
    : `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;color:#999;">No content yet</body></html>`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;

      // Inject our outline styles once per load.
      if (!doc.getElementById("__vai_select_styles")) {
        const styleEl = doc.createElement("style");
        styleEl.id = "__vai_select_styles";
        styleEl.textContent = STYLE_BLOCK;
        doc.head?.appendChild(styleEl);
      }

      // Apply selected outline if a path is set.
      doc.querySelectorAll("[data-vai-selected]").forEach((el) =>
        el.removeAttribute("data-vai-selected"),
      );
      if (selectable && selectedPath && selectedPath.length > 0) {
        const target = pathToElement(doc.body, selectedPath);
        if (target) target.setAttribute("data-vai-selected", "true");
      }

      if (!selectable) return;

      // Hover outline.
      const onMove = (ev: MouseEvent) => {
        const target = ev.target as Element | null;
        if (!target) return;
        const sel = findSelectableAncestor(target, doc.body);
        doc.querySelectorAll("[data-vai-hover]").forEach((el) =>
          el.removeAttribute("data-vai-hover"),
        );
        if (sel) sel.setAttribute("data-vai-hover", "true");
      };
      const onLeave = () => {
        doc.querySelectorAll("[data-vai-hover]").forEach((el) =>
          el.removeAttribute("data-vai-hover"),
        );
      };
      const onClick = (ev: MouseEvent) => {
        const target = ev.target as Element | null;
        if (!target) return;
        const sel = findSelectableAncestor(target, doc.body);
        if (sel) {
          ev.preventDefault();
          const path = computeDomPath(sel, doc.body);
          onElementClick?.(path);
        } else {
          onBackgroundClick?.();
        }
      };

      doc.addEventListener("mousemove", onMove);
      doc.addEventListener("mouseleave", onLeave);
      doc.addEventListener("click", onClick);
      // Listeners are scoped to this load — replaced on next srcDoc change.
      // No explicit cleanup needed: the iframe document is destroyed.
    };
    iframe.addEventListener("load", onLoad);
    // The first render already fired `load` before the listener attached when
    // srcDoc was set synchronously — call onLoad once for the current doc too.
    onLoad();
    return () => iframe.removeEventListener("load", onLoad);
  }, [srcDoc, selectable, selectedPath, onElementClick, onBackgroundClick]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      className={className}
      style={{ background: "white", colorScheme: "light", ...style }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: PASS — no new errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/flows/HtmlPreviewIframe.tsx
git commit -m "feat(flows): HtmlPreviewIframe component with click/hover wiring"
```

---

## Task 7: Wire selection state in `MessageComposer` (single-preview)

**Files:**
- Modify: `client/src/components/flows/MessageComposer.tsx`

This task replaces the single-preview iframe with `HtmlPreviewIframe`, adds selection state, and renders the scope chip above the prompt. Sending the snippet path comes in Task 8.

- [ ] **Step 1: Add a selection summary helper**

Near the top of `client/src/components/flows/MessageComposer.tsx` (just below the imports), add:

```ts
function summarizeSelectedElement(snippet: string): string {
  // Extract tag + first ~40 chars of inner text for the chip.
  const tagMatch = snippet.match(/^<([a-z0-9]+)/i);
  const tag = tagMatch ? tagMatch[1].toUpperCase() : "Element";
  const text = snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const preview = text.length <= 40 ? text : text.slice(0, 39) + "…";
  const human: Record<string, string> = {
    H1: "Heading", H2: "Heading", H3: "Heading", H4: "Heading", H5: "Heading", H6: "Heading",
    P: "Paragraph", LI: "List item", A: "Link", BUTTON: "Button",
    IMG: "Image", BLOCKQUOTE: "Quote",
  };
  const label = human[tag] || tag;
  return preview ? `${label} "${preview}"` : label;
}
```

- [ ] **Step 2: Replace the existing `HtmlEmailPreview` with the new component**

Find the `HtmlEmailPreview` function in `MessageComposer.tsx` (around line 116). Replace its body with a thin wrapper around `HtmlPreviewIframe`. Add the import at the top:

```tsx
import { HtmlPreviewIframe } from "./HtmlPreviewIframe";
```

Then replace the function:

```tsx
function HtmlEmailPreview({
  content,
  selectable,
  selectedPath,
  onElementClick,
  onBackgroundClick,
}: {
  content: string;
  selectable: boolean;
  selectedPath: number[] | null;
  onElementClick?: (path: number[]) => void;
  onBackgroundClick?: () => void;
}) {
  return (
    <div className="h-full p-4">
      <div className="border rounded-lg overflow-hidden h-full min-h-64">
        <HtmlPreviewIframe
          html={content}
          selectable={selectable}
          selectedPath={selectedPath}
          onElementClick={onElementClick}
          onBackgroundClick={onBackgroundClick}
          className="w-full h-full"
          style={{ minHeight: "300px" }}
          title="HTML Email Preview"
        />
      </div>
    </div>
  );
}
```

Then update its single call site inside `PreviewPanel` (around line 287) — pass through new props and a placeholder `selection` from the upcoming state:

```tsx
{channel === "html_email" && (
  <HtmlEmailPreview
    content={messageContent}
    selectable={selectable}
    selectedPath={selectedPath}
    onElementClick={onElementClick}
    onBackgroundClick={onBackgroundClick}
  />
)}
```

Add the matching props to `PreviewPanel`:

```tsx
function PreviewPanel({
  channel,
  messageContent,
  messageSubject,
  onSubjectChange,
  onExamplePromptClick,
  isGenerating,
  selectable,
  selectedPath,
  onElementClick,
  onBackgroundClick,
}: {
  channel: "sms" | "email" | "html_email";
  messageContent: string;
  messageSubject: string;
  onSubjectChange: (v: string) => void;
  onExamplePromptClick?: (prompt: string) => void;
  isGenerating?: boolean;
  selectable: boolean;
  selectedPath: number[] | null;
  onElementClick?: (path: number[]) => void;
  onBackgroundClick?: () => void;
}) {
```

- [ ] **Step 3: Add selection state and the scope chip in the main component**

Inside `MessageComposer` (around line 663), add state and a clear-on-variant-change effect:

```tsx
const [selection, setSelection] = useState<{
  path: number[];
  snippet: string;
  summary: string;
} | null>(null);

// Clear selection when the user activates a different variant.
useEffect(() => {
  setSelection(null);
}, [activeVariantLabel]);
```

Below the existing state, add helpers shared with the chat panel:

```tsx
const handleElementClick = (path: number[]) => {
  // Find the element in the current messageContent to capture its outerHTML
  // for the chip summary. We re-derive in handleSend, so this is just for UI.
  // In single-preview mode the iframe holds the same source as messageContent;
  // we don't re-parse here — the chip uses a fresh snippet pulled in handleSend.
  // For now store the path and a best-effort summary.
  // (We pull the summary by parsing the source once.)
  const doc = new DOMParser().parseFromString(messageContent || "", "text/html");
  let node: Element | null = doc.body;
  for (const idx of path) {
    if (!node) { node = null; break; }
    node = node.children[idx] || null;
  }
  if (!node) {
    setSelection(null);
    return;
  }
  setSelection({
    path,
    snippet: node.outerHTML,
    summary: summarizeSelectedElement(node.outerHTML),
  });
};

const handleBackgroundClick = () => setSelection(null);
```

Pass the new props through the single `PreviewPanel` invocation (around line 803):

```tsx
<PreviewPanel
  channel={channel}
  messageContent={messageContent}
  messageSubject={messageSubject}
  onSubjectChange={onSubjectChange}
  onExamplePromptClick={(p) => chatPaneRef.current?.submitPrompt(p)}
  isGenerating={!!generatingLabels && generatingLabels.size > 0}
  selectable={channel === "html_email"}
  selectedPath={selection?.path ?? null}
  onElementClick={handleElementClick}
  onBackgroundClick={handleBackgroundClick}
/>
```

- [ ] **Step 4: Render the scope chip just above the prompt textarea**

In the same render tree (the `<div className="border-t p-3 bg-background">` wrapping `AiChatPanel`, around line 820), insert a chip above the chat panel:

```tsx
<div className="border-t p-3 bg-background">
  {selection && (
    <div className="mb-2 inline-flex items-center gap-1 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs">
      <span>Scope: {selection.summary}</span>
      <button
        type="button"
        onClick={() => setSelection(null)}
        className="ml-1 hover:text-foreground"
        title="Clear scope"
        data-testid="button-clear-flows-ai-scope"
      >
        ×
      </button>
    </div>
  )}
  <AiChatPanel
    ref={chatPaneRef}
    channel={channel}
    segmentFilters={segmentFilters}
    promoCode={promoCode}
    referenceUrl={referenceUrl}
    onMessageGenerated={onContentChange}
    onSubjectGenerated={onSubjectChange}
    onLoadingChange={onChatLoadingChange}
    selection={selection}
    sourceContent={messageContent}
    onSelectionApplied={() => setSelection(null)}
  />
</div>
```

We're passing three new props (`selection`, `sourceContent`, `onSelectionApplied`) to `AiChatPanel` — extend its `Props` type now even though the implementation lands in Task 8:

```tsx
const AiChatPanel = forwardRef<AiChatPanelHandle, {
  channel: "sms" | "email" | "html_email";
  segmentFilters: Array<{ field: string; operator: string; value: string }>;
  promoCode: string | null;
  referenceUrl: string;
  onMessageGenerated: (content: string) => void;
  onSubjectGenerated?: (subject: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  // ── NEW ──
  selection: { path: number[]; snippet: string; summary: string } | null;
  sourceContent: string;
  onSelectionApplied: () => void;
}>(function AiChatPanel(
  {
    channel,
    segmentFilters,
    promoCode,
    referenceUrl,
    onMessageGenerated,
    onSubjectGenerated,
    onLoadingChange,
    selection,
    sourceContent,
    onSelectionApplied,
  },
  ref,
) {
```

(`selection`, `sourceContent`, `onSelectionApplied` are accepted but unused for now — Task 8 wires the send path.)

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`. Navigate to `/business/flows`, create a flow with HTML email, ask the AI for a newsletter, then in the rendered preview:
- Hover over a paragraph → dashed gray outline appears.
- Click a heading → solid blue outline + scope chip "Scope: Heading 'X'" above the prompt.
- Click the email's empty area → outline clears, chip disappears.
- Click a `<div>` wrapper → nothing happens (it's not whitelisted).
- ✕ on the chip clears the selection.

Document anything unexpected before continuing.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/flows/MessageComposer.tsx
git commit -m "feat(flows): selection state + scope chip in MessageComposer"
```

---

## Task 8: Wire snippet-edit through `AiChatPanel.handleSend`

**Files:**
- Modify: `client/src/components/flows/MessageComposer.tsx`

- [ ] **Step 1: Add the snippet-path branch in `AiChatPanel.handleSend`**

Inside `AiChatPanel`, find `handleSend` (around line 380) and add a branch BEFORE the existing apiRequest call. Also add an undo ref scoped to the panel:

```tsx
import {
  markElementByPath,
  replaceMarkedElement,
  stripMarkers,
  extractHeadContent,
} from "@/lib/htmlEditScope";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";

// ... inside AiChatPanel:

const { toast } = useToast();
const undoRef = useRef<string | null>(null);

const handleSend = async (explicitPrompt?: string) => {
  const text = (explicitPrompt ?? prompt).trim();
  if (!text || !hospitalId || loading) return;

  // ── Snippet-edit path: scoped to a single element ──
  if (selection && channel === "html_email") {
    const marked = markElementByPath(sourceContent, selection.path);
    if (!marked) {
      toast({
        title: "Couldn't find the selected element",
        description: "Please re-select an element and try again.",
        variant: "destructive",
      });
      onSelectionApplied();
      return;
    }
    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages([...messages, userMessage]);
    setPrompt("");
    setLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/compose`,
        {
          channel,
          prompt: text,
          selectedSnippet: marked.snippet,
          brandHead: extractHeadContent(sourceContent),
          previousMessages: messages,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { replacementSnippet?: string };
      const replacement = (data.replacementSnippet || "").trim();
      if (!replacement) throw new Error("empty replacement");

      let next: string;
      try {
        next = stripMarkers(
          replaceMarkedElement(marked.markedHtml, marked.markerId, replacement),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "splice failed";
        throw new Error(`Couldn't apply edit — ${msg}. Please rephrase.`);
      }

      undoRef.current = sourceContent;
      onMessageGenerated(next);
      onSelectionApplied();
      toast({
        title: "AI updated the element",
        description: "Click ↶ to revert.",
        action: (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (undoRef.current !== null) {
                onMessageGenerated(undoRef.current);
                undoRef.current = null;
                toast({ title: "Reverted to previous version" });
              }
            }}
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
        ),
      });
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: t("flows.compose.elementEdited", "Element updated — see preview →"),
      };
      setMessages([...messages, userMessage, aiMessage]);
    } catch (err) {
      const errMessage: ChatMessage = {
        role: "assistant",
        content:
          err instanceof Error
            ? err.message
            : t("flows.compose.aiError", "Error generating message. Please try again."),
      };
      setMessages([...messages, userMessage, errMessage]);
      toast({
        title: "AI edit failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
    return;
  }

  // ── Existing full-document / variant path (unchanged) ──
  const userMessage: ChatMessage = { role: "user", content: text };
  const newMessages = [...messages, userMessage];
  setMessages(newMessages);
  setPrompt("");
  setLoading(true);

  try {
    const res = await apiRequest(
      "POST",
      `/api/business/${hospitalId}/flows/compose`,
      {
        channel,
        prompt: userMessage.content,
        segmentDescription,
        promoCode,
        referenceUrl: referenceUrl.trim() || undefined,
        previousMessages: messages,
      }
    );
    // ... rest of existing code ...
  }
};
```

(The existing path stays exactly as it is; the snippet-edit branch returns before reaching it.)

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Manual smoke test**

`npm run dev` → `/business/flows` → create an HTML email → click a CTA button → enter prompt "make this button bigger and use the same brand color" → Send.

Verify:
- Loading spinner on the send button.
- After ~2-5s the preview updates and only that button changes (visually compare).
- Toast shows "AI updated the element" with an Undo button.
- Click Undo → preview reverts to the prior content.
- Selection clears after the edit (chip gone).

Edge cases:
- Selection set, but click ✕ on chip BEFORE sending → chip clears, send falls through to the full-document path (existing behavior).
- AI returns malformed HTML (force this by editing the helpers to return `<p>a</p><p>b</p>`) → toast: "Couldn't apply edit — replacement must be a single root element…". Content unchanged.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/flows/MessageComposer.tsx
git commit -m "feat(flows): wire snippet-edit through AiChatPanel.handleSend"
```

---

## Task 9: Variants — install handler on each split-preview iframe

**Files:**
- Modify: `client/src/components/flows/MessageComposer.tsx`

The split-preview block (around line 707, the `splitPreviews && splitPreviews.length >= 2` branch) currently renders inline `<iframe>` elements. Replace each with `HtmlPreviewIframe` and route clicks through the parent's `selection` state.

- [ ] **Step 1: Replace the inline split-preview iframe**

Find the JSX block that renders each variant (the `.map((v) => { ... })` around line 714). Replace the inline `<iframe>` (currently inside the `<div className="flex-1 min-h-0 overflow-hidden">` around line 779) with:

```tsx
<div className="flex-1 min-h-0 overflow-hidden">
  {channel === "html_email" ? (
    <HtmlPreviewIframe
      html={v.messageTemplate}
      selectable={isActive}
      selectedPath={isActive ? (selection?.path ?? null) : null}
      onElementClick={(path) => {
        // Already active (selectable=true gates this) — set selection.
        const doc = new DOMParser().parseFromString(v.messageTemplate || "", "text/html");
        let node: Element | null = doc.body;
        for (const idx of path) {
          if (!node) { node = null; break; }
          node = node.children[idx] || null;
        }
        if (!node) return;
        setSelection({
          path,
          snippet: node.outerHTML,
          summary: summarizeSelectedElement(node.outerHTML),
        });
      }}
      onBackgroundClick={() => setSelection(null)}
      className="w-full h-full"
      title={`Variant ${v.label} preview`}
    />
  ) : channel === "sms" ? (
    <SmsPreview content={v.messageTemplate} />
  ) : (
    <EmailPreview subject={v.messageSubject ?? ""} content={v.messageTemplate} />
  )}
</div>
```

- [ ] **Step 2: Make inactive-variant iframes click-to-activate**

`HtmlPreviewIframe` already exposes `onElementClick`/`onBackgroundClick`. For inactive variants we want any click in the iframe to activate the variant — fire `onActivateVariant(v.label)` in BOTH callbacks of an inactive variant, and abort selection by passing `selectable={false}`. The `selectable={false}` path of the component disables hover/click outline AND passes a click listener that does nothing — but the iframe document still receives the raw click. We need a simple wrapper to capture *any* click on the iframe area.

Simplest: wrap the inactive-variant iframe in a transparent button overlay using the existing variant header pattern, OR add an `onAnyClick` callback to `HtmlPreviewIframe`. Use the latter — extend `HtmlPreviewIframe` with one more optional prop:

In `client/src/components/flows/HtmlPreviewIframe.tsx`, add `onAnyClick?: () => void` to `Props`, accept it in destructuring, and inside the `onLoad` install:

```ts
if (!selectable) {
  // Even when not selectable, surface a single coarse "I clicked the iframe"
  // signal — used to activate inactive A/B variants on click.
  if (onAnyClick) {
    doc.addEventListener("click", () => onAnyClick());
  }
  return;
}
```

Then in `MessageComposer.tsx`, the inactive-variant branch becomes:

```tsx
{channel === "html_email" ? (
  <HtmlPreviewIframe
    html={v.messageTemplate}
    selectable={isActive}
    selectedPath={isActive ? (selection?.path ?? null) : null}
    onElementClick={
      isActive
        ? (path) => {
            const doc = new DOMParser().parseFromString(v.messageTemplate || "", "text/html");
            let node: Element | null = doc.body;
            for (const idx of path) {
              if (!node) { node = null; break; }
              node = node.children[idx] || null;
            }
            if (!node) return;
            setSelection({
              path,
              snippet: node.outerHTML,
              summary: summarizeSelectedElement(node.outerHTML),
            });
          }
        : undefined
    }
    onBackgroundClick={isActive ? () => setSelection(null) : undefined}
    onAnyClick={!isActive ? () => onActivateVariant?.(v.label) : undefined}
    className="w-full h-full"
    title={`Variant ${v.label} preview`}
  />
) : ... }
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (variants)**

`npm run dev` → `/business/flows` → create or open an HTML campaign with two variants (A/B). Verify:
- Click anywhere inside variant B's iframe (when A is active) → variant B becomes active. No selection.
- Now click a heading inside variant B's iframe → scope chip appears, heading outlined blue.
- Click variant A's header (existing button) → selection clears (chip gone).
- Click a paragraph inside variant A → new selection, scoped to A.
- Send a prompt with a selection → only the active variant's content updates (`onMessageGenerated` already targets the active variant via the parent's existing wiring).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/flows/HtmlPreviewIframe.tsx client/src/components/flows/MessageComposer.tsx
git commit -m "feat(flows): two-step variant interaction with element selection"
```

---

## Task 10: Final verification + ship

**Files:**
- (Verification only)

- [ ] **Step 1: Lint and typecheck**

Run: `npm run check`
Expected: PASS — no errors in any modified file.

- [ ] **Step 2: Run all tests**

Run: `npm test -- tests/htmlEditScope.test.ts tests/flowsComposeHelpers.test.ts`
Expected: PASS — 19 tests across two files.

Then full suite to catch regressions:

Run: `npm test`
Expected: PASS or no NEW failures vs main.

- [ ] **Step 3: Manual end-to-end pass**

Walk the full flow once more, top to bottom, on a fresh `npm run dev`:
1. Generate an HTML newsletter via the AI prompt.
2. Click an `<h1>` → scope chip says "Heading …".
3. Prompt "translate to English" → only that heading's text changes.
4. Undo via the toast → reverts.
5. Click a `<p>` → chip says "Paragraph …".
6. Prompt "make this warmer" → only that paragraph rewrites.
7. ✕ chip → next prompt regenerates the whole document (existing behavior intact).
8. Add a B variant → click in B → activates B. Click an element in B → chip + outline. Send a prompt → B updates, A unchanged.

- [ ] **Step 4: Final commit (squash if multiple WIP commits accumulated)**

If your tree has clean per-task commits already, skip squash. Otherwise:

```bash
git log --oneline main..HEAD
# squash if needed:
git rebase -i main
```

- [ ] **Step 5: No PR yet**

Per the user's standing preference, don't push or open a PR until the user reviews the change locally and explicitly asks. Just leave the branch in a clean state.

---

## Self-review notes

**Spec coverage:**
- Decision 1 (whitelist) — Tasks 6 (`SELECTABLE_TAGS`) ✅
- Decision 2 (snippet-only AI call) — Tasks 5 (backend branch), 8 (frontend wiring) ✅
- Decision 3 (two-step variants) — Task 9 ✅
- Decision 4 (no marker pollution) — Tasks 4 (`stripMarkers`), 8 (called on splice result) ✅
- Marker / splice-back semantics — Tasks 1–4 (utilities), 8 (integration) ✅
- Failure modes (parse, multi-root, path lookup) — Task 3 (`replaceMarkedElement` throws), Task 8 (toast + revert), Task 8 (path-lookup toast) ✅
- Backend schema + branch — Task 5 ✅
- Tests for utilities — Tasks 1–4 ✅
- Manual checks for hover/click/edit — Tasks 7, 8, 9 manual smoke steps ✅

**Type consistency:**
- `markElementByPath` returns `{ markedHtml, markerId, snippet }` in both Task 2 (definition) and Task 8 (consumer) — ✅
- `replaceMarkedElement` signature `(markedHtml, markerId, replacement)` in Task 3 (definition) and Task 8 (consumer) — ✅
- `selection: { path, snippet, summary }` shape in Task 7 (state) and `AiChatPanel` props (Task 7 + Task 8) — ✅
- `HtmlPreviewIframe` props consistent across Tasks 6, 7, 9 — ✅ (Task 9 adds `onAnyClick` and Task 6's component is updated to accept it).

**No placeholders or TODOs.**
