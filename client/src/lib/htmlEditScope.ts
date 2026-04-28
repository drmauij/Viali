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
