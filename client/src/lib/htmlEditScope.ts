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
