import { Link } from "wouter";
import { useEffect } from "react";

type Param = { name: string; type: string; example: string; notes?: string };

function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left font-medium px-3 py-2">Name</th>
            <th className="text-left font-medium px-3 py-2">Type</th>
            <th className="text-left font-medium px-3 py-2">Example</th>
            <th className="text-left font-medium px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-t">
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{p.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.type}</td>
              <td className="px-3 py-2 font-mono text-xs">{p.example}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BOOKING_PARAMS_SERVICE: Param[] = [
  { name: "service", type: "string", example: "rhinoplasty", notes: "Service code to preselect" },
  { name: "service_group", type: "string", example: "aesthetic-face", notes: "Filter services by group" },
  { name: "provider", type: "uuid", example: "a1b2c3d4-…", notes: "Preselect a specific provider" },
];
const BOOKING_PARAMS_PREFILL: Param[] = [
  { name: "firstName", type: "string", example: "Maria", notes: "Prefill patient first name" },
  { name: "surname", type: "string", example: "Müller", notes: "Prefill patient surname" },
  { name: "email", type: "string", example: "maria@example.com" },
  { name: "phone", type: "string", example: "+41791234567" },
];
const BOOKING_PARAMS_UTM: Param[] = [
  { name: "utm_source", type: "string", example: "google" },
  { name: "utm_medium", type: "string", example: "cpc" },
  { name: "utm_campaign", type: "string", example: "spring-2026" },
  { name: "utm_term", type: "string", example: "brustvergroesserung" },
  { name: "utm_content", type: "string", example: "ad-variant-a" },
];
const BOOKING_PARAMS_CLICKIDS: Param[] = [
  { name: "gclid", type: "string", example: "abc123…", notes: "Google Ads click ID" },
  { name: "gbraid", type: "string", example: "0AAAAA…", notes: "Google Ads (iOS app)" },
  { name: "wbraid", type: "string", example: "0AAAAA…", notes: "Google Ads (web→app)" },
  { name: "fbclid", type: "string", example: "IwAR0…", notes: "Meta click ID" },
  { name: "ttclid", type: "string", example: "E.C.…", notes: "TikTok click ID" },
  { name: "msclkid", type: "string", example: "abc123", notes: "Microsoft Ads click ID" },
  { name: "igshid", type: "string", example: "MzRlO…", notes: "Instagram share ID" },
  { name: "li_fat_id", type: "string", example: "abc123", notes: "LinkedIn click ID" },
  { name: "twclid", type: "string", example: "abc123", notes: "Twitter/X click ID" },
];
const BOOKING_PARAMS_MISC: Param[] = [
  { name: "ref", type: "string", example: "partner-site", notes: "Free-form referrer label" },
  { name: "campaign_id", type: "string", example: "12345" },
  { name: "adset_id", type: "string", example: "67890" },
  { name: "ad_id", type: "string", example: "24680" },
  { name: "promo", type: "string", example: "SPRING20", notes: "Promo code to apply" },
  { name: "embed", type: "boolean", example: "true", notes: "Hides chrome for iframe embedding" },
];

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

          <section id="booking-link">
            <h2 className="text-2xl font-bold tracking-tight mb-2">Booking link (/book)</h2>
            <p className="text-muted-foreground mb-6">
              The public booking page each hospital publishes at <code className="px-1 py-0.5 rounded bg-muted text-sm">/book/&lt;HOSPITAL_BOOKING_TOKEN&gt;</code>.
              No API key needed — the booking token in the URL identifies the hospital. Append query parameters to preselect a service,
              prefill patient fields, or attach campaign tracking.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-2">Service selection</h3>
            <ParamTable params={BOOKING_PARAMS_SERVICE} />

            <h3 className="text-lg font-semibold mt-6 mb-2">Patient prefill</h3>
            <ParamTable params={BOOKING_PARAMS_PREFILL} />

            <h3 className="text-lg font-semibold mt-6 mb-2">UTM tracking</h3>
            <ParamTable params={BOOKING_PARAMS_UTM} />

            <h3 className="text-lg font-semibold mt-6 mb-2">Ad click IDs</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Captured on the lead record and echoed back through the Conversions API so ad platforms can match conversions to clicks.
            </p>
            <ParamTable params={BOOKING_PARAMS_CLICKIDS} />

            <h3 className="text-lg font-semibold mt-6 mb-2">Misc</h3>
            <ParamTable params={BOOKING_PARAMS_MISC} />

            <h3 className="text-lg font-semibold mt-8 mb-2">Example</h3>
            <pre className="text-xs overflow-x-auto rounded-lg border bg-muted p-3">
{`https://<your-viali-host>/book/<HOSPITAL_BOOKING_TOKEN>?service=rhinoplasty&firstName=Maria&email=maria@example.com&utm_source=google&utm_campaign=spring-2026&gclid=abc123`}
            </pre>
          </section>
        </main>
      </div>
    </div>
  );
}
