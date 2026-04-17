import { Link } from "wouter";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Moon, Sun } from "lucide-react";
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

export default function PublicApiDocs() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">Viali</Link>
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

      <main className="max-w-4xl mx-auto px-4 py-8">
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
          <article className="public-api-docs prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-table:text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ pre: CopyablePre as any }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}
