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
    const parent: Element | null = node.parentElement;
    if (!parent) return [];
    const idx = Array.from(parent.children).indexOf(node);
    if (idx < 0) return [];
    path.unshift(idx);
    node = parent;
  }
  return path;
}

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
    const child: Element | undefined = node.children[idx];
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
  const cleaned: string = stripMarkdownFences(replacement).trim();
  if (!cleaned) throw new Error("replacement is empty");

  // Validate single-root: parse in a fresh template and count element children.
  const tpl: HTMLTemplateElement = document.createElement("template");
  tpl.innerHTML = cleaned;
  const roots: HTMLCollection = tpl.content.children;
  if (roots.length !== 1) {
    throw new Error(`replacement must be a single root element, got ${roots.length}`);
  }

  const doc: Document = new DOMParser().parseFromString(markedHtml, "text/html");
  const target: Element | null = doc.querySelector(`[data-vai-marker="${cssEscape(markerId)}"]`);
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
export function extractHeadContent(html: string, maxLen: number = 3000): string {
  const m: RegExpMatchArray | null = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!m) return "";
  return m[1].slice(0, maxLen);
}
