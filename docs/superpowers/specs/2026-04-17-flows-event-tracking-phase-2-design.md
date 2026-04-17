# Flows Event Tracking (Phase 2) — Design Spec

**Date:** 2026-04-17
**Phase:** 2 of the Flows compliance + analytics roadmap
**Builds on:** Phase 1 (compliance foundation, merged 2026-04-17 as `b257b095`)
**Status:** Design — pending implementation

## Goal

Replace the `DUMMY_STATS` placeholder in the Flows campaign dashboard with real engagement data sourced from a Resend webhook, and surface per-campaign metrics + drill-down. After this phase ships, the dashboard truthfully shows sent / delivered / opened / clicked / bounced / complained / booked per campaign, instead of hardcoded "34% open rate".

## Why this scope (and not more)

The viali.app/flows marketing page claims A/B testing, automatic winner selection, per-campaign revenue, and automated reminders. None of those work today. Phase 2 deliberately tackles only the **event-tracking foundation** because:

- Email opens/clicks/bounces/complaints are the only signals that have **no provider-free substitute** (UTMs only fire on click+book, missing 95% of engagement). This is the actual unlock.
- Booking attribution rides on existing `referral_events` infrastructure built for ad tracking — no new schema needed beyond a one-line `utm_content = flow.id` change in the send loop.
- A/B testing (Phase 3) and revenue (Phase 2.1) sit on top of this foundation — they need to know "who opened" and "who clicked" first.
- ASPSMS delivery callbacks (deferred to Phase 2.5) add ~5% information value at non-trivial cost; sync API response already covers "did the send go through" for SMS.

## Non-goals

- Revenue per campaign (Phase 2.1 — needs services-price join, has nuance around overrides/packages)
- ASPSMS delivery tracking (Phase 2.5 — sync send response is good enough for SMS in Phase 2)
- Per-execution attribution tokens (Phase 3 — only A/B testing needs to know "this booking came from variant A vs B for patient Maria")
- Cached aggregates (defer until query volume demands it; live queries are <50ms for hospital-scale data)
- Engagement-based segments ("send to patients who opened X but didn't book") — Phase 3 territory
- A/B testing — Phase 3
- Tracking pixel / click-redirect endpoint — Resend's webhook gives the same signal more accurately and with less code

## Architecture overview

```
┌──────────────┐       ┌──────────────────┐
│  Send loop   │──────▶│   Resend API     │
│ (flows.ts)   │       │  send() returns  │
└──────────────┘       │     email.id     │
        │              └──────────────────┘
        │ store id on flow_executions             ┌─────────────────────┐
        ▼                                          │  Recipient inbox    │
 ┌──────────────────┐                              │  opens / clicks /   │
 │ flow_executions  │                              │  bounces / etc.     │
 │ + resend_email_id│                              └─────────┬───────────┘
 └──────────────────┘                                        │
        ▲                                                     ▼
        │                                          ┌────────────────────┐
        │ webhook handler                          │   Resend → Svix    │
        │ looks up by id                           │  signed webhook    │
        └─────────────── POST /api/webhooks/resend ◀┴────────────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │   flow_events    │
                   │ (engagement log) │
                   └──────────────────┘
                            ▲
                            │ aggregated by metrics queries
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
  Flows.tsx (list)                   FlowMetrics.tsx (drill-down)
   - top-line totals                  - funnel
   - per-row mini-strip               - bounce list
                                      - complaint list
                                      - daily time-series chart
```

## Data model

### Schema change

One nullable column + one partial index on the existing `flow_executions` table:

```typescript
// shared/schema.ts — flow_executions table
export const flowExecutions = pgTable("flow_executions", {
  // ... existing columns ...
  resendEmailId: varchar("resend_email_id"), // nullable; SMS sends don't get one
}, (table) => [
  // ... existing indexes ...
  index("idx_flow_executions_resend_email_id")
    .on(table.resendEmailId)
    .where(sql`${table.resendEmailId} IS NOT NULL`),
]);
```

### Migration

```sql
-- Migration 0222: track Resend message IDs on flow executions for webhook lookup
-- Idempotent.

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "resend_email_id" varchar;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_resend_email_id"
  ON "flow_executions" ("resend_email_id")
  WHERE "resend_email_id" IS NOT NULL;
```

### Reusing existing tables

- **`flow_events`** (already exists) — gets new `eventType` values: `delivered`, `opened`, `clicked`, `bounced`, `complained`. Existing `sent` semantics unchanged. Resend-specific extras (bounce subType, click URL, complaint feedback type) go into the existing `metadata` JSONB column.
- **`referral_events`** (already exists) — already captures every UTM param when a booking happens. Per-campaign booking attribution rides on `WHERE utm_content = <flow.id>`. No schema change.
- **`patients`** (already extended in Phase 1) — `emailMarketingConsent` flag is the consent gate the webhook flips on `email.complained`.

### Why no per-execution token in the booking URL

Phase 2 only needs **per-campaign** attribution ("how many bookings did this flow drive?"), and `utm_content = flow.id` answers that uniquely. **Per-execution** attribution ("did Maria specifically click and book from Tuesday's send?") is only required for A/B testing, which lands in Phase 3 with its own token.

## Webhook architecture

### Endpoint

`POST /api/webhooks/resend` — public route, signature-verified, no auth header. Lives in a new `server/routes/marketingWebhooks.ts`. Registered in `server/routes/index.ts` next to `marketingUnsubscribeRouter` (the public-section group).

### Signature verification (Svix-compatible)

Resend uses the Svix signing standard. Headers on every webhook:
- `svix-id` — unique per delivery
- `svix-timestamp` — unix seconds
- `svix-signature` — `v1,<base64sig>` (may contain multiple comma-separated signatures during secret rotation)

Verification: HMAC-SHA256 over the literal string `${svix_id}.${svix_timestamp}.${raw_body}` using the Resend webhook secret. Expected signature compared via `timingSafeEqual`. Reject if all comma-separated signatures fail or if `svix-timestamp` is more than 5 minutes off server time (replay protection).

A new helper module `server/services/svixSignature.ts` encapsulates this — same shape as `marketingUnsubscribeToken.ts` from Phase 1, also using only `node:crypto` (no `svix` npm dep — the package is ~150KB and pulls extra dependencies for ~15 lines of HMAC).

### Event routing

Single endpoint, switched by `event.type`:

```
verify signature → if invalid: 400 → return
parse body
look up flow_execution by resend_email_id (one query, indexed)

if no execution found:
  return 200 (transactional or pre-Phase-2 email — expected)

switch (event.type):
  case "email.sent":
  case "email.delivered":
  case "email.opened":
  case "email.clicked":
    insert flow_event { executionId, eventType, metadata: full Resend payload }

  case "email.bounced":
    insert flow_event with metadata.bounce.subType
    DO NOT touch consent flags (data quality signal, not consent signal)

  case "email.complained":
    insert flow_event
    UPDATE patients SET email_marketing_consent = false,
                       marketing_unsubscribed_at = NOW()
    WHERE id = execution.patient_id
    log structured warning

  case "email.delivery_delayed":
    return 200, write nothing (Resend retries automatically — noise)

  default:
    return 200, log unknown type at debug level
```

**Always returns 200 except on signature failure.** Resend retries non-2xx; "unknown email_id" is success because pre-Phase-2 sends and all transactional emails (password resets, OTP, booking confirmations, invoices) flow through Resend too and would otherwise generate noise.

### Capturing the Resend message ID at send time

In `server/routes/flows.ts` send loop, after `client.emails.send(...)` returns:

```typescript
const sendResult = await client.emails.send({...});
if (sendResult.data?.id) {
  await db.update(flowExecutions)
    .set({ resendEmailId: sendResult.data.id })
    .where(eq(flowExecutions.id, execution.id));
}
sendSuccess = !!sendResult.data?.id;
```

Currently the send loop discards Resend's response data — Phase 2 captures it.

## Dashboard query architecture

**Approach:** multiple small SQL queries merged in JS. Rejected single mega-JOIN — independently testable, independently cacheable later, easier to reason about.

### List view (`Flows.tsx`)

Three queries:

1. **Existing** `GET /api/business/:hospitalId/flows` returns campaigns. Unchanged.
2. **New** `GET /api/business/:hospitalId/flows/metrics/summary?since=<iso>`. The `since` parameter defaults to start-of-current-month if omitted (matches the existing `Marketing.tsx` analytics convention). Older campaigns still appear in the campaign list (Query 1) — they just show "—" for metrics in the period:
   ```sql
   SELECT
     fe.flow_id,
     COUNT(*) FILTER (WHERE ev.event_type = 'sent')                  AS sent,
     COUNT(*) FILTER (WHERE ev.event_type = 'delivered')             AS delivered,
     COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')   AS opened,
     COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked')  AS clicked,
     COUNT(*) FILTER (WHERE ev.event_type = 'bounced')               AS bounced,
     COUNT(*) FILTER (WHERE ev.event_type = 'complained')            AS complained
   FROM flow_executions fe
   JOIN flow_events ev ON ev.execution_id = fe.id
   JOIN flows f ON f.id = fe.flow_id
   WHERE f.hospital_id = $1
     AND fe.started_at >= $2
   GROUP BY fe.flow_id;
   ```
   `COUNT(DISTINCT fe.id)` for opened/clicked because Resend fires multiple events per execution (patient may open the email twice).

3. **New** booking counts via `referral_events`:
   ```sql
   SELECT
     re.utm_content AS flow_id,
     COUNT(*) FILTER (WHERE re.appointment_id IS NOT NULL) AS bookings
   FROM referral_events re
   WHERE re.hospital_id = $1
     AND re.utm_content = ANY($2)
   GROUP BY re.utm_content;
   ```

JS merges the three results: `flows.map(f => ({ ...f, ...counts[f.id], bookings: bookings[f.id] ?? 0 }))`. Top-line aggregates = a `reduce` across the merged array. Both queries are wrapped behind a single `summarizeFlows(hospitalId, since)` helper in `server/services/marketingMetricsQuery.ts`.

### Drill-down view (`/business/flows/:id/metrics`)

Four queries behind a single `flowDetail(flowId)` helper, served by new `GET /api/business/:hospitalId/flows/:flowId/metrics`. The drill-down is always all-time scoped (no `since` filter) — once you're focused on a single campaign you want its full lifetime, not a windowed slice.

1. Funnel counts — same shape as list query 2 but `WHERE flow_id = :id`. Returns one row.
2. Bounce list — `SELECT patient.email, ev.metadata->>'subType' AS bounce_type, ev.created_at FROM flow_events ev JOIN flow_executions fe ON fe.id = ev.execution_id JOIN patients p ON p.id = fe.patient_id WHERE ev.event_type = 'bounced' AND fe.flow_id = :id ORDER BY ev.created_at DESC LIMIT 100`.
3. Complaint list — same shape, `WHERE event_type = 'complained'`.
4. Daily time-series:
   ```sql
   SELECT
     DATE(ev.created_at) AS day,
     COUNT(*) FILTER (WHERE event_type = 'opened')  AS opened,
     COUNT(*) FILTER (WHERE event_type = 'clicked') AS clicked
   FROM flow_events ev
   JOIN flow_executions fe ON fe.id = ev.execution_id
   WHERE fe.flow_id = :id
   GROUP BY DATE(ev.created_at)
   ORDER BY day;
   ```

### Performance

Live queries every page load. With existing `idx_flow_executions_flow` and the new partial index on `resend_email_id`, a 50-campaign hospital's three list queries combined run in <50ms. If query latency ever exceeds that, the existing `marketing_ai_analyses` cached-aggregates table is the established pattern to follow.

### Charts

Uses Recharts (already a dependency — see `client/src/pages/business/Marketing.tsx`, `Dashboard.tsx`, `CostAnalytics.tsx`).

## Send-loop change for stable booking attribution

Add one line to the URL builder in `server/routes/flows.ts` (currently around line 990):

```typescript
params.set("utm_content", flow.id);
```

`flow.id` is a UUID, never changes, globally unique — survives renames and same-name collisions. The whole `/book` → `referral_events` pipeline already captures `utm_content` end-to-end (verified — `BookAppointment.tsx:161`, `clinic.ts:824`); Phase 2 just populates a column that's currently empty for Flows-driven bookings.

## Frontend changes

### `client/src/pages/business/Flows.tsx`

- Delete `DUMMY_STATS` (lines 29–34).
- Add a new `useQuery` calling `/api/business/:hospitalId/flows/metrics/summary` returning the merged metrics + top-line aggregates.
- Replace the top-line `Card` row with real numbers (campaigns this month, total reached, average open rate, total bookings).
- Each `TableRow` for a campaign gets a small text strip near the name showing `${sent} sent · ${opened} opened · ${bookings} booked`.
- Add a "View metrics" link/button in the row's actions column → routes to `/business/flows/:id/metrics`.

### New page `client/src/pages/business/FlowMetrics.tsx`

- Fetches `/api/business/:hospitalId/flows/:flowId/metrics` on mount.
- Renders a funnel section (sent → delivered → opened → clicked → booked).
- Renders a Recharts area chart of daily opened + clicked counts.
- Renders two collapsible sections: bounce list (table of email + type + date) and complaint list (table of email + date).
- Header shows campaign name, status, channel, send date.

### Routing

`client/src/App.tsx` — add `<Route path="/business/flows/:id/metrics" element={<FlowMetrics />} />` next to existing `/business/flows/:id`.

## File structure

### New files

| Path | Purpose |
|---|---|
| `migrations/0222_flow_executions_resend_email_id.sql` | Idempotent ALTER + partial index |
| `server/services/svixSignature.ts` | HMAC-SHA256 verify with replay protection |
| `server/services/marketingMetricsQuery.ts` | `summarizeFlows()` and `flowDetail()` query helpers |
| `server/routes/marketingWebhooks.ts` | `POST /api/webhooks/resend` handler |
| `client/src/pages/business/FlowMetrics.tsx` | Drill-down metrics page |
| `tests/svix-signature.test.ts` | Signature verification tests |
| `tests/marketing-webhooks-resend.test.ts` | Webhook event routing tests |
| `tests/marketing-metrics-query.test.ts` | Query helper tests |

### Modified files

| Path | Change |
|---|---|
| `shared/schema.ts` | Add `resendEmailId` column + partial index to `flow_executions` |
| `server/routes/index.ts` | Register `marketingWebhooksRouter` (public, no auth) |
| `server/routes/flows.ts` | Capture Resend `email.id` in send loop; add `utm_content = flow.id` to booking URL; add two new GET endpoints (`/metrics/summary`, `/:flowId/metrics`) |
| `client/src/App.tsx` | New route `/business/flows/:id/metrics` |
| `client/src/pages/business/Flows.tsx` | Kill `DUMMY_STATS`; fetch real summary; per-row mini-strip; "View metrics" link |
| `server/routes/publicDocs.ts` | Document `/api/webhooks/resend` (event types subscribed, signature scheme) |
| `tests/public-docs.test.ts` | Assert webhook path documented |

## Test coverage summary

| Test file | Scenarios |
|---|---|
| `svix-signature.test.ts` | Valid signature passes; tampered fails; missing headers fail; stale timestamp (>5 min) fails; multi-signature rotation header (commas) handled |
| `marketing-webhooks-resend.test.ts` | Each event type routes correctly; unknown email_id returns 200 no-op; complaint side-effect flips consent; bounce does NOT flip consent; `delivery_delayed` returns 200 silently; signature failure returns 400 |
| `marketing-metrics-query.test.ts` | `summarizeFlows` returns correct shape; `flowDetail` returns correct shape; `opened`/`clicked` use COUNT DISTINCT; bookings join via `utm_content` works; flow with zero events returns zeros (not nulls); time-series respects ordering |

Estimated +20 new tests. Existing 33 Phase 1 tests untouched.

## Operational rollout

### Pre-deploy

1. Generate `RESEND_WEBHOOK_SECRET` (32+ random chars) and add to Exoscale `ecosystem.config.cjs`.
2. In the Resend dashboard, add a webhook endpoint `https://use.viali.app/api/webhooks/resend` with the secret. Subscribe to: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`. Skip `email.delivery_delayed`.
3. Confirm `app.set("trust proxy", 1)` is set (already verified during Phase 1 — `server/auth/google.ts:108`).

### After deploy

4. Send a test campaign to a known address. Confirm: webhook fires within seconds, `flow_events` rows appear, dashboard renders real numbers.
5. Click the tracked link in the email body. Confirm: `clicked` event arrives.
6. Mark the email as spam in inbox. Confirm: `complained` event arrives, `emailMarketingConsent` flips to `false` on that patient record.

### Rollback safety

Phase 2 is purely additive. No existing field changes meaning, no existing endpoint changes shape. If the webhook misbehaves: disable the endpoint in the Resend dashboard. The system reverts to Phase 1 behavior with zero data loss (`flow_events` rows persist, just stop accumulating).

## Estimated scope

~600 lines of new code (split: ~150 webhook handler + ~100 metrics query helpers + ~200 metrics page + ~100 schema/migration/wiring + ~50 doc updates) + ~20 tests. ~1 day focused implementation.

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Resend webhook over tracking pixel | More accurate, less code, zero open-tracking false positives from email-client pre-fetching |
| 2 | Skip `email.delivery_delayed` | Resend auto-retries; pure noise for operators |
| 3 | Hybrid consent handling: complaint → auto-opt-out, bounce → surface only | Complaint is unambiguous legal signal; bounce can be misclassified by aggressive corporate filters |
| 4 | Custom HMAC verification, not the `svix` package | Same `node:crypto` pattern as Phase 1's unsubscribe token; ~15 lines vs 150KB dependency |
| 5 | Single shared webhook endpoint, filter by known `resend_email_id` | Resend is one account for all of Viali; transactional emails (password resets etc.) hit the same endpoint and are silently ignored |
| 6 | `utm_content = flow.id` in booking URL | Stable join key surviving rename + duplicate-name; reuses existing `referral_events.utmContent` column already populated end-to-end |
| 7 | Multiple small queries merged in JS, not single mega-JOIN | Independently testable, independently cacheable, debuggable |
| 8 | Live queries; no caching layer in Phase 2 | <50ms with existing indexes; existing `marketing_ai_analyses` table is the established cache pattern when needed |
| 9 | List view inline strip + dedicated drill-down page | Standard SaaS shape; drill-down is where Phase 3's A/B test results will land |
| 10 | Skip ASPSMS delivery (defer to 2.5) | Sync send response covers 95% of operator need; second webhook integration would scope-creep |
| 11 | Skip per-execution attribution token (defer to 3) | Per-campaign attribution suffices for Phase 2 dashboard claims; per-execution only needed for A/B winner selection |
| 12 | Skip revenue per campaign (defer to 2.1) | Adds services-price join with nuance (overrides, packages); booking count alone validates the pipeline |
| 13 | Column name `resend_email_id` (not generic `external_id`) | Locked to Resend in foreseeable scope; explicit > generic |
