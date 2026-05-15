import { Link } from "wouter";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Link as LinkIcon, Menu, Moon, Sun, X as XIcon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

function CopyablePre({ children, ...rest }: { children?: ReactNode } & React.HTMLAttributes<HTMLPreElement>) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = preRef.current?.innerText ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/10 transition-opacity"
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
        data-testid="copy-code-button"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <pre ref={preRef} {...rest}>{children}</pre>
    </div>
  );
}

// Stable, lowercase, hyphenated slug derived from heading text. Mirrors the
// behaviour of common Markdown slugifiers (github-slugger-style) so anchors
// stay predictable across renders.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function childrenToText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (children && typeof children === "object" && "props" in (children as any)) {
    return childrenToText((children as any).props?.children);
  }
  return "";
}

type TocEntry = { id: string; text: string; level: 2 | 3 };

// Parse `## ` and `### ` headings from raw markdown, skipping fenced code blocks.
// Returns an ordered list with slugs that match what the rendered <h2>/<h3>
// components produce. Duplicate slugs get `-2`, `-3`, ... suffixes.
function buildToc(markdown: string): TocEntry[] {
  const lines = markdown.split("\n");
  const out: TocEntry[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  let fenceMarker = "";

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (line.startsWith(fenceMarker.repeat(3))) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2].replace(/`/g, "").trim();
    let id = slugify(text);
    if (!id) continue;
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (count > 1) id = `${id}-${count}`;
    out.push({ id, text, level });
  }

  return out;
}

// Mirror buildToc's id-allocation so rendered h2/h3 components match TOC links.
// We track usage during render the same way buildToc tracks it during parse.
function createSlugAllocator() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text);
    if (!base) return "";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base}-${count}` : base;
  };
}

function HeadingAnchor({ id, level, children }: { id: string; level: 2 | 3; children: ReactNode }) {
  const Tag = (level === 2 ? "h2" : "h3") as "h2" | "h3";
  return (
    <Tag id={id} className="group/heading scroll-mt-24 relative">
      <a
        href={`#${id}`}
        aria-label={`Link to ${childrenToText(children)}`}
        className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/heading:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground no-underline"
        onClick={(e) => {
          // let the browser update the hash and scroll naturally
          e.stopPropagation();
        }}
      >
        <LinkIcon className="w-4 h-4 inline" />
      </a>
      {children}
    </Tag>
  );
}

export default function PublicApiDocs() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = "Viali API — documentation for third-party integrations";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = "HTTP API reference for Viali clinics: booking link parameters, leads webhook, and conversions API.";
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api.md")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) setMarkdown(text);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toc = useMemo(() => (markdown ? buildToc(markdown) : []), [markdown]);

  // Scroll to the hash target once content is rendered. Supports partial
  // matches (e.g. `#conversions` → first heading whose id starts with
  // "conversions") so external/shorthand links keep working.
  useEffect(() => {
    if (!markdown || toc.length === 0) return;
    const targetFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!hash) return null;
      let el = document.getElementById(hash);
      if (el) return el;
      const fallback = toc.find((e) => e.id.startsWith(hash));
      return fallback ? document.getElementById(fallback.id) : null;
    };
    const scrollNow = () => {
      const el = targetFromHash();
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    // Defer one frame so ReactMarkdown has committed the IDs.
    const raf = requestAnimationFrame(scrollNow);
    window.addEventListener("hashchange", scrollNow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", scrollNow);
    };
  }, [markdown, toc]);

  // Highlight whichever heading is currently in view.
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    for (const entry of toc) {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [toc]);

  // Allocator must be re-created on every render so React doesn't reuse stale
  // counts from prior passes — buildToc and the render walk both have to start
  // with empty state to agree on suffixing.
  const allocate = createSlugAllocator();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden w-8 h-8 rounded-md hover:bg-accent flex items-center justify-center"
              onClick={() => setMobileTocOpen((v) => !v)}
              aria-label={mobileTocOpen ? "Close contents" : "Open contents"}
              data-testid="public-docs-toc-toggle"
            >
              {mobileTocOpen ? <XIcon className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <Link href="/" className="font-semibold tracking-tight">Viali</Link>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="/api.md" className="underline hover:text-foreground">Raw /api.md</a>
            <span className="hidden sm:inline">API documentation</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-md hover:bg-accent hover:text-foreground flex items-center justify-center transition-colors"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              data-testid="public-docs-theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
          {/* Sidebar TOC */}
          <aside
            className={[
              "lg:block lg:sticky lg:top-14 lg:self-start lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:py-8",
              "border-b lg:border-b-0 lg:border-r lg:pr-6",
              mobileTocOpen ? "block" : "hidden",
            ].join(" ")}
            aria-label="Table of contents"
          >
            <nav className="py-4 lg:py-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
                On this page
              </p>
              {toc.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {toc.map((entry) => {
                    const isActive = entry.id === activeId;
                    return (
                      <li key={entry.id}>
                        <a
                          href={`#${entry.id}`}
                          onClick={() => setMobileTocOpen(false)}
                          className={[
                            "block rounded-md px-2 py-1 transition-colors",
                            entry.level === 3 ? "pl-5 text-[13px]" : "font-medium",
                            isActive
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                          ].join(" ")}
                          data-testid={`toc-link-${entry.id}`}
                        >
                          {entry.text}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          </aside>

          {/* Main content */}
          <main className="py-8">
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load API docs: {error}. Try fetching{" "}
                <a href="/api.md" className="underline">/api.md</a> directly.
              </div>
            )}
            {!markdown && !error && (
              <div className="text-sm text-muted-foreground">Loading…</div>
            )}
            {markdown && (
              <article className="public-api-docs prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-24 prose-table:text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: CopyablePre as any,
                    h2: ({ children }) => {
                      const text = childrenToText(children);
                      const id = allocate(text);
                      return (
                        <HeadingAnchor id={id} level={2}>
                          {children}
                        </HeadingAnchor>
                      );
                    },
                    h3: ({ children }) => {
                      const text = childrenToText(children);
                      const id = allocate(text);
                      return (
                        <HeadingAnchor id={id} level={3}>
                          {children}
                        </HeadingAnchor>
                      );
                    },
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </article>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
