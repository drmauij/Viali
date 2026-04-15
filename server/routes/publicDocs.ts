import { Router, type Request, type Response } from "express";

// Single source of truth for Viali's public API docs.
// Served raw at /api.md (agents, llms.txt) and rendered at /api (humans).
// Update this string whenever a public endpoint or URL parameter changes.
export const PUBLIC_API_MD = `# Viali API

Public HTTP endpoints for connecting external systems (Make, Zapier, ad platforms, custom backends, AI agents) to a Viali clinic.

> This document is the single source of truth for Viali's public API.
> It is served raw at \`/api.md\` and rendered at \`/api\` for humans.

## Authentication

Each hospital generates its own API key. The key is passed as a \`?key=\` query parameter on every request.

**Getting a key:** ask a Viali admin at your clinic to open \`/admin/integrations\` → **API Key** tab and share the hospital ID and generated key with you.

## Base URL

Replace \`https://<your-viali-host>\` in the examples below with the host your clinic runs on (for example \`https://use.viali.app\`).

---

## Booking link (/book)

The public booking page each hospital publishes at:

\`\`\`
/book/<HOSPITAL_BOOKING_TOKEN>
\`\`\`

No API key needed — the booking token in the URL identifies the hospital. Append query parameters to preselect a service, prefill patient fields, or attach campaign tracking.

### Service selection

| Name | Type | Example | Notes |
|---|---|---|---|
| \`service\` | string | \`rhinoplasty\` | Service code to preselect |
| \`service_group\` | string | \`aesthetic-face\` | Filter services that belong to this group (a service may belong to multiple groups) |
| \`provider\` | uuid | \`a1b2c3d4-…\` | Preselect a specific provider |

### Patient prefill

| Name | Type | Example | Notes |
|---|---|---|---|
| \`firstName\` | string | \`Maria\` | Prefill patient first name |
| \`surname\` | string | \`Müller\` | Prefill patient surname |
| \`email\` | string | \`maria@example.com\` | |
| \`phone\` | string | \`+41791234567\` | |

### UTM tracking

| Name | Type | Example |
|---|---|---|
| \`utm_source\` | string | \`google\` |
| \`utm_medium\` | string | \`cpc\` |
| \`utm_campaign\` | string | \`spring-2026\` |
| \`utm_term\` | string | \`brustvergroesserung\` |
| \`utm_content\` | string | \`ad-variant-a\` |

### Ad click IDs

Captured on the lead record and echoed back through the Conversions API so ad platforms can match conversions to clicks.

| Name | Type | Example | Notes |
|---|---|---|---|
| \`gclid\` | string | \`abc123…\` | Google Ads click ID |
| \`gbraid\` | string | \`0AAAAA…\` | Google Ads (iOS app) |
| \`wbraid\` | string | \`0AAAAA…\` | Google Ads (web→app) |
| \`fbclid\` | string | \`IwAR0…\` | Meta click ID |
| \`ttclid\` | string | \`E.C.…\` | TikTok click ID |
| \`msclkid\` | string | \`abc123\` | Microsoft Ads click ID |
| \`igshid\` | string | \`MzRlO…\` | Instagram share ID |
| \`li_fat_id\` | string | \`abc123\` | LinkedIn click ID |
| \`twclid\` | string | \`abc123\` | Twitter/X click ID |

### Misc

| Name | Type | Example | Notes |
|---|---|---|---|
| \`ref\` | string | \`partner-site\` | Free-form referrer label |
| \`campaign_id\` | string | \`12345\` | |
| \`adset_id\` | string | \`67890\` | |
| \`ad_id\` | string | \`24680\` | |
| \`promo\` | string | \`SPRING20\` | Promo code to apply |
| \`embed\` | boolean | \`true\` | Hides chrome for iframe embedding |

### Example

\`\`\`
https://<your-viali-host>/book/<HOSPITAL_BOOKING_TOKEN>?service=rhinoplasty&firstName=Maria&email=maria@example.com&utm_source=google&utm_campaign=spring-2026&gclid=abc123
\`\`\`

---

## Leads Webhook

Forward leads from your website contact form or Meta Lead Ads (via Make/Zapier) into Viali. Each lead becomes a record in the business inbox with full UTM / click ID attribution.

\`\`\`
POST /api/webhooks/leads/<HOSPITAL_ID>?key=<YOUR_API_KEY>
\`\`\`

### Required fields

- \`source\` — \`fb\`, \`ig\`, \`website\`, or any free-form label
- \`first_name\`, \`last_name\`
- At least one of \`email\` or \`phone\`

### Meta (Facebook / Instagram) leads

Also require: \`lead_id\`, \`form_id\`, \`operation\`.

### Website leads

May also include \`message\`, any UTM params, and any of the ad click IDs listed under [Booking link](#booking-link-book).

### Response

\`\`\`json
{
  "status": "received",
  "id": "lead-uuid"
}
\`\`\`

Use the returned \`id\` to deep-link to the lead in Viali at \`/leads/<id>\`.

### Error responses

- \`401\` — missing or invalid \`key\`
- \`403\` — webhook is disabled for this hospital
- \`400\` — validation failed (missing required field)

### Example — website contact form

\`\`\`bash
curl -X POST "https://<your-viali-host>/api/webhooks/leads/YOUR_HOSPITAL_ID?key=YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "website",
    "first_name": "Maria",
    "last_name": "Müller",
    "email": "maria@example.com",
    "phone": "+41791234567",
    "message": "Interested in rhinoplasty",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "spring-2026",
    "gclid": "abc123"
  }'
\`\`\`

### Example — Meta Lead Ads (via Make)

\`\`\`bash
curl -X POST "https://<your-viali-host>/api/webhooks/leads/YOUR_HOSPITAL_ID?key=YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "fb",
    "lead_id": "123456789",
    "form_id": "987654321",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "+41791234567",
    "operation": "Rhinoplasty"
  }'
\`\`\`

---

## Conversions API

Pull conversion events for ad-platform reporting (Google Ads offline conversions, Meta Conversions API, etc.). Useful as the source for a scheduled Make / Zapier flow that pushes conversions back to your ad platforms.

\`\`\`
GET /api/webhooks/conversions/<HOSPITAL_ID>?key=<YOUR_API_KEY>
\`\`\`

### Query parameters

- \`key\` — your API key *(required)*
- \`platform\` — \`meta_forms\`, \`meta_ads\`, or \`google_ads\` *(optional — omit to get all platforms)*
- \`level\` — \`kept\`, \`surgery_planned\`, or \`paid\` *(optional — omit to get all levels)*
- \`from\` / \`to\` — ISO date range filter, e.g. \`2026-01-01\` *(optional)*

### Conversion levels

- \`kept\` — the patient showed up to their appointment (arrived, in progress, or completed).
- \`surgery_planned\` — a surgery has been scheduled for this patient.
- \`paid\` — the surgery has been paid for.

### Response

\`\`\`json
[
  {
    "lead_id": "123456789",
    "event_name": "lead_converted",
    "event_time": 1712700000,
    "lead_value": "5000",
    "currency": "CHF",
    "platform": "meta_forms",
    "level": "kept"
  }
]
\`\`\`

Each result includes \`platform\` and \`level\` so you can filter on your end when pulling everything at once.

### Example — Meta Lead Forms "kept" conversions

\`\`\`bash
curl "https://<your-viali-host>/api/webhooks/conversions/YOUR_HOSPITAL_ID?key=YOUR_API_KEY&platform=meta_forms&level=kept&from=2026-01-01&to=2026-04-10"
\`\`\`
`;

export const LLMS_TXT = `# Viali API

> Viali's public API for booking links, lead ingestion, and
> ad-platform conversion reporting.

## Docs

- [Full API reference (markdown)](/api.md): machine-readable source of truth
- [Human-friendly docs](/api): rendered version of /api.md
- Booking link parameters: see /api.md#booking-link-book
- Leads webhook: see /api.md#leads-webhook
- Conversions API: see /api.md#conversions-api

## Auth

Per-hospital API keys, generated by a hospital admin at
/admin/integrations (tab: API Key). Passed as \`?key=\` query param.
`;

export function llmsTxtHandler(_req: Request, res: Response) {
  res.type("text/plain; charset=utf-8").send(LLMS_TXT);
}

export function apiMdHandler(_req: Request, res: Response) {
  res.type("text/markdown; charset=utf-8").send(PUBLIC_API_MD);
}

const router = Router();
router.get("/llms.txt", llmsTxtHandler);
router.get("/api.md", apiMdHandler);
export default router;
