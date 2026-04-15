import { Link } from "wouter";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function PublicApiDocs() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <span>API documentation</span>
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
          <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-table:text-sm prose-code:before:content-none prose-code:after:content-none prose-code:font-mono prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}
