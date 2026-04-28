import { useEffect, useRef, type CSSProperties } from "react";
import { computeDomPath } from "@/lib/htmlEditScope";

const SELECTABLE_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "LI", "A", "BUTTON", "IMG", "BLOCKQUOTE",
  // Inline text containers — AI-generated emails wrap prices, badges,
  // emphasized phrases in these.
  "SPAN", "STRONG", "EM", "B", "I", "SMALL", "MARK", "CODE",
]);

const STYLE_BLOCK = `
[data-vai-hover] { outline: 2px dashed #94a3b8 !important; outline-offset: 2px; cursor: pointer; }
[data-vai-selected] { outline: 2px solid #3b82f6 !important; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(59,130,246,0.2); }
`;

// A DIV / TD is selectable only as a "leaf" — text content but no
// element children. Catches badge-style pills (duration "30 Min",
// rounded chips) without letting users select wrapper sections.
function isLeafTextContainer(el: Element): boolean {
  if (el.tagName !== "DIV" && el.tagName !== "TD") return false;
  if (el.children.length > 0) return false;
  return (el.textContent || "").trim().length > 0;
}

function findSelectableAncestor(start: Element, root: Element): Element | null {
  let n: Element | null = start;
  while (n && n !== root) {
    if (SELECTABLE_TAGS.has(n.tagName) || isLeafTextContainer(n)) return n;
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
  onAnyClick?: () => void;
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
  onAnyClick,
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

      if (!selectable) {
        // Even when not selectable, surface a single coarse "I clicked the iframe"
        // signal — used to activate inactive A/B variants on click.
        if (onAnyClick) {
          doc.addEventListener("click", () => onAnyClick());
        }
        return;
      }

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
  }, [srcDoc, selectable, selectedPath, onElementClick, onBackgroundClick, onAnyClick]);

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
