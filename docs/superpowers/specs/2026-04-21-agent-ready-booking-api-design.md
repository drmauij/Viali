# Agent-Ready Booking API

**Date:** 2026-04-21
**Status:** Design approved, ready for planning
**Scope:** Viali-side changes only (clinic website changes are separate)

## Background

Clinics hosting their booking flow on Viali (e.g. privatklinik-kreuzlingen.ch) score low on agent-readiness audits like [isitagentready.com](https://isitagentready.com) because there is no documented, machine-discoverable API an AI agent can use to book an appointment.

The plumbing already exists. `client/src/pages/BookAppointment.tsx` is a thin SPA over nine public JSON endpoints under `/api/public/booking/:token/*` (services, slots, best-provider, closures, prefill, promo, book, etc.). The gap is documentation + discovery + stability, not implementation.

The goal is to make that surface agent-ready so that:

- Personal agents (e.g. naturaumana.ai) can book on behalf of a user
- Clinic-website chatbots can book without leaving the site
- Automation tools (Make, Zapier, n8n) can integrate without reverse-engineering the SPA
- Agent-readiness scorers detect Viali clinics as "ready"

## Goals

- Document the 9 existing booking endpoints as a first-class public API
- Publish an OpenAPI 3.1 schema alongside the human-readable Markdown
- Raise booking POST rate limit to 30/15min and add `Idempotency-Key` support
- Enable CORS on `/api/public/booking/*` so browser-based agents work
- Stabilize the error-response shape — every error returns `{ code, message }` with machine-stable codes and English messages
- Extend `/llms.txt` and add `/.well-known/openapi.json` so scorers find the API

## Non-goals

- **Cancel / reschedule endpoints** — CEO has explicitly said patient-initiated cancellation should stay friction-heavy. Cancellation continues to flow through the existing email action-token path.
- **"My appointments" lookup** — lookup by patient email alone is a PHI/auth footgun; would need a magic-link design pass.
- **MCP server** — revisit in Phase 2 once OpenAPI adoption proves the surface.
- **Per-agent API keys** — would defeat the "personal agent" use case; the hospital booking token remains the only auth.
- **Clinic-website edits** — a separate repo; covered by a short hand-off prompt, not this plan.

## Architecture

Two parallel sources of truth, enforced in sync with tests:

```
server/routes/publicDocs.ts
 └── PUBLIC_API_MD            → /api.md, /api, /llms.txt  (humans + LLM prose)

server/routes/publicOpenApi.ts  (NEW)
 └── OPENAPI_SPEC             → /api/openapi.json, /api/openapi.yaml  (agents)

          │                        │
          └────────────┬───────────┘
                       ▼
          /api/public/booking/:token/*
          (existing routes in server/routes/clinic.ts
           + CORS + idempotency + stable error codes)
```

**Why two sources instead of generating one from the other:**

- Generating MD from OpenAPI kills the hand-written prose (auth walkthrough, webhook examples) that makes `/api` useful to humans.
- Generating OpenAPI from MD requires parsing structured tables — fragile.
- Instead, keep both hand-written and enforce parity with `tests/public-docs.test.ts`. The test suite is the integrity layer.

## Endpoints

All under `/api/public/booking/:bookingToken` — already implemented in `server/routes/clinic.ts`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Hospital info + bookable providers |
| GET | `/services` | Service list |
| GET | `/closures` | Blocked dates |
| GET | `/providers/:providerId/available-dates` | Which dates have slots in a range |
| GET | `/providers/:providerId/slots?date=YYYY-MM-DD` | Slots on a given date |
| GET | `/best-provider?service=…&date=…` | Next-available heuristic |
| GET | `/prefill?token=…` | Prefill form from short-lived token |
| GET | `/promo/:code` | Validate discount code |
| POST | `/book` | Create appointment *(idempotent via `Idempotency-Key`)* |

No endpoints are added or removed. `POST /book` gains `Idempotency-Key` handling.

## Error contract

Today error responses are inconsistent — some return `{ message: "…" }` in German, some return `{ message, errors }`, some return `{ message, code }`. Agents need stable, English, machine-parseable errors.

**New unified shape (all error responses):**

```json
{ "code": "SLOT_TAKEN", "message": "The selected slot is no longer available." }
```

**Stable code catalog (frozen public contract, documented in `PUBLIC_API_MD` and `OPENAPI_SPEC`):**

| Code | HTTP | Meaning |
|---|---|---|
| `SLOT_TAKEN` | 409 | Slot was taken between availability query and book |
| `INVALID_BOOKING_DATA` | 400 | Payload failed schema validation (includes `fieldErrors` array) |
| `REFERRAL_REQUIRED` | 400 | Hospital requires UTM / referral source |
| `PROVIDER_NOT_BOOKABLE` | 404 | Provider not public / not bookable |
| `HOSPITAL_NOT_FOUND` | 404 | Booking token invalid or disabled |
| `PROMO_INVALID` | 404 | Promo code unknown or expired |
| `RATE_LIMITED` | 429 | Rate limiter tripped |
| `IDEMPOTENCY_CONFLICT` | 409 | Same `Idempotency-Key`, different request body |

Existing German message strings (e.g. `server/routes/clinic.ts:828`) become English server-side defaults. The SPA already translates by `code` where it matters — we keep that pattern, just swap the default message language.

## Idempotency

New table `booking_idempotency_keys`:

```sql
CREATE TABLE IF NOT EXISTS booking_idempotency_keys (
  hospital_id uuid NOT NULL,
  key text NOT NULL,
  appointment_id uuid NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, key)
);
CREATE INDEX IF NOT EXISTS booking_idempotency_keys_created_at_idx
  ON booking_idempotency_keys (created_at);
```

Behavior on `POST /api/public/booking/:token/book` when `Idempotency-Key` header is present:

1. Compute `request_hash = sha256(normalized_body)`.
2. Lookup `(hospital_id, key)`.
3. If found with matching `request_hash` → return the existing appointment's response (200, not 201) with `X-Idempotent-Replay: true`.
4. If found with different `request_hash` → return 409 `IDEMPOTENCY_CONFLICT`.
5. If not found → create appointment, insert row, return 201.

Rows older than 24h are deleted by a periodic cleanup. Implementation: check `server/cron/` (or wherever scheduled jobs live — confirm during planning) for an existing daily-cleanup task to piggyback on. If none exists, add a lightweight `setInterval` running every 6 hours in `server/index.ts`.

The header is **optional** — clients without it behave exactly as today. This keeps the SPA unchanged.

## CORS

Add CORS middleware scoped to `/api/public/booking`:

```ts
app.use('/api/public/booking', cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Idempotency-Key'],
  credentials: false,
}));
```

Does not change any other route's CORS behavior. The rest of the API stays same-origin.

## Rate limits

| Limiter | Before | After | Notes |
|---|---|---|---|
| `apiLimiter` (global `/api`) | 300/min/IP | **unchanged** | Covers reads; confirmed sufficient |
| `bookingSubmitLimiter` (`POST /book`) | 10/15min/IP | **30/15min/IP** | Headroom for family/household agents |

Every 429 returns `{ code: "RATE_LIMITED", message: "…" }` via a custom handler so the error shape stays consistent.

## OpenAPI + discovery

**`/api/openapi.json`** and **`/api/openapi.yaml`** — both served from one `OPENAPI_SPEC` constant in `server/routes/publicOpenApi.ts`. Spec version `3.1.0`. Includes:

- All 9 paths with parameters, request/response schemas
- Request body schemas generated from existing Zod schemas via `zod-to-json-schema` (already a transitive dep — verify before planning)
- The 8 error codes as a shared `#/components/schemas/Error`
- `Idempotency-Key` header on POST `/book`
- `x-rateLimit` extensions documenting the limits

**`/llms.txt`** updated to index both docs:

```
# Viali Clinic Booking — Agent Index

/api.md            — Human + agent Markdown docs
/api/openapi.json  — OpenAPI 3.1 schema
/api/openapi.yaml  — Same, YAML

## Booking quick-start
1. GET  /api/public/booking/{token}/services
2. GET  /api/public/booking/{token}/providers/{providerId}/slots?date=YYYY-MM-DD
3. POST /api/public/booking/{token}/book  (Idempotency-Key header recommended)
```

**`/.well-known/openapi.json`** — 302 redirect to `/api/openapi.json`. Some scorers probe this path.

**Response headers on `/api/public/booking/*`:**

- `X-Robots-Tag: all`
- `Cache-Control: public, max-age=60` on read endpoints (keeps polling agents from hammering)
- CORS headers via the middleware above

**Deliberately NOT adding:** `/.well-known/ai-plugin.json` (ChatGPT-plugin spec is effectively deprecated in 2026).

## Testing

Extending `tests/public-docs.test.ts`:

| Test | Asserts |
|---|---|
| MD ↔ routes parity *(exists, keep)* | Every endpoint in `PUBLIC_API_MD` is a real route |
| OpenAPI ↔ routes parity *(new)* | Every path in `openapi.json` matches a real route, and vice versa |
| OpenAPI ↔ MD parity *(new)* | Every path in `openapi.json` is mentioned in `PUBLIC_API_MD` |
| Error-code catalog *(new)* | Every `code` returned by `/api/public/booking/*` is in the catalog |
| Idempotency — same key same payload *(integration)* | Two POSTs, same key + body → one appointment, replayed response, `X-Idempotent-Replay: true` |
| Idempotency — same key different payload *(integration)* | Second POST, same key, different body → 409 `IDEMPOTENCY_CONFLICT` |
| CORS preflight *(new)* | `OPTIONS` with cross-origin → 204 + allow headers |
| Rate limit *(new)* | 31st POST in 15min → 429 `RATE_LIMITED` |
| `/llms.txt` served *(new)* | Returns 200, references `/api.md` + `/api/openapi.json` |
| `/api/openapi.json` parses *(new)* | Valid JSON, `openapi: "3.1.0"`, has `paths` |

## Rollout

Nine independently mergeable steps, each reversible:

1. **Error-code stabilization + English messages** — safest refactor, ships first. Update `server/routes/clinic.ts` error responses to the new shape. SPA continues translating by code.
2. **CORS middleware** on `/api/public/booking/*`.
3. **Idempotency table + migration** (idempotent SQL, `IF NOT EXISTS`), plus POST `/book` handler changes.
4. **Raise `bookingSubmitLimiter`** 10 → 30 in `server/index.ts`.
5. **`OPENAPI_SPEC` + `/api/openapi.json` + `/api/openapi.yaml` + `/.well-known/openapi.json`** redirect.
6. **Extend `PUBLIC_API_MD`** with a new `## Booking API (JSON)` section after the existing `## Booking link (/book)` section. Agent-facing happy-path walkthrough.
7. **Update `/llms.txt`** to index both `/api.md` and `/api/openapi.json`.
8. **Admin UI: "Share with AI agents" dialog** in `BookingTokenSection.tsx` — button + dialog with pre-filled prompt (see section below). Ships with rollout 6/7 since it references `/api` and the booking URL structure.
9. **Extend test suite** with the 10 tests above. Run existing `tests/public-docs.test.ts` each step.

Each step is a single PR; reverting any one does not break the ones before it.

## Monitoring

- Log `Idempotency-Key` replay hits (counter metric) — proves agents are using it
- Log `POST /book` `User-Agent` + `Origin` for the first 30 days — see what agents actually hit us
- No new dashboards — ad-hoc queries via the existing logging stack are enough

## Admin UI — "Share with AI agents" dialog

To save each clinic's technical staff from having to write this prompt themselves, Viali will surface it in-product.

**Location:** `client/src/pages/admin/components/BookingTokenSection.tsx` — the "Patient Booking Page" card under `/admin → Booking`.

**Trigger:** a new button `🤖 Share with AI agents` on the button row next to `Regenerate Link` and `Disable Link`. Shown only when a booking token exists.

**Dialog contents:**

- Short English explainer: *"Copy this prompt into your website builder (Replit, Lovable, v0, Bolt, etc.) to let AI agents book appointments on behalf of patients visiting your website."*
- Scrollable `<pre>` with the full prompt, pre-filled:
  - `<VIALI-HOST>` → `window.location.origin`
  - `<OUR-BOOKING-TOKEN>` → the hospital's booking token
- `Copy prompt` button (reuses the `copied` state pattern already in the file)
- `Learn more → /api` link (opens `/api` in a new tab)
- `Close` button

**Implementation notes:**

- Reuse shadcn/ui `Dialog` (already used across admin pages)
- Prompt template lives as a constant in the component file; rendered via template-literal substitution
- UI labels (title, explainer, buttons) go through `t(…)` for i18n — existing pattern in this file. Languages: DE / EN / IT / FR / ES
- Prompt body itself stays in English — website-builder agents and AI tools expect English prompts
- No backend changes
- Smoke test: dialog renders with the booking URL and token interpolated correctly

**Scope:** ~60 lines in one component file + i18n keys in 5 locale JSONs + one render test. Fits into Rollout step 6 (`Extend PUBLIC_API_MD`) as the "make the API visible to clinic staff" piece.

## Clinic website (out of scope, reference only)

Separate repo. The prompt now lives inside Viali (see above); each clinic's technical staff copies it from `/admin → Booking → Share with AI agents` and pastes it into their own website builder. No cross-repo coordination needed.

## Phase 2 candidates (explicitly not in this plan)

- MCP server endpoint — expose booking as a tool personal agents can add directly
- Per-agent API keys — audit + differentiated rate limits
- Magic-link auth flow for "my appointments" lookup
- Cancel / reschedule endpoints (blocked by CEO policy — revisit only if policy changes)
