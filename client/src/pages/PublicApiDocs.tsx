import { Link } from "wouter";
import { useEffect } from "react";

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "booking-link", label: "Booking link (/book)" },
  { id: "leads-webhook", label: "Leads Webhook" },
  { id: "conversions-api", label: "Conversions API" },
];

export default function PublicApiDocs() {
  useEffect(() => {
    document.title = "Viali API — documentation for third-party integrations";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">Viali</Link>
          <div className="text-sm text-muted-foreground">API documentation</div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 grid gap-8 md:grid-cols-[240px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <details className="md:hidden border rounded-lg p-3" open>
            <summary className="cursor-pointer text-sm font-medium">On this page</summary>
            <nav className="mt-2 space-y-1 text-sm">
              {SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="block px-2 py-1 rounded hover:bg-muted">
                  {s.label}
                </a>
              ))}
            </nav>
          </details>
          <nav className="hidden md:block space-y-1 text-sm">
            <div className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground">On this page</div>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block px-2 py-1 rounded hover:bg-muted">
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-16 [&_h1]:scroll-mt-20 [&_h2]:scroll-mt-20 [&_h3]:scroll-mt-20">
          <section id="overview">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Viali API</h1>
            <p className="text-muted-foreground text-lg mb-6">
              Public HTTP endpoints for connecting external systems (Make, Zapier,
              ad platforms, custom backends, AI agents) to a Viali clinic.
            </p>

            <h2 className="text-xl font-semibold mt-8 mb-2">Authentication</h2>
            <p className="mb-3">
              Each hospital generates its own API key. The key is passed as a
              <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-sm">?key=</code>
              query parameter on every request.
            </p>
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-medium mb-1">Getting a key</p>
              <p className="text-muted-foreground">
                Ask a Viali admin at your clinic to open{" "}
                <code className="px-1 py-0.5 rounded bg-background">/admin/integrations</code>{" "}
                → <strong>API Key</strong> tab and share the hospital ID and generated key with you.
              </p>
            </div>

            <h2 className="text-xl font-semibold mt-8 mb-2">Base URL</h2>
            <p>
              Replace <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-sm">https://&lt;your-viali-host&gt;</code>{" "}
              in the examples with the host your clinic runs on (e.g. <code className="px-1 py-0.5 rounded bg-muted text-sm">https://app.viali.ch</code>).
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
