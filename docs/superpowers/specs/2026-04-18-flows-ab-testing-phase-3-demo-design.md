# Flows A/B Testing (Phase 3 — demo-grade subset) — Design Spec

**Date:** 2026-04-18 (revised — supersedes the earlier full-scope Phase 3 spec for the Patrick demo on Wednesday)
**Phase:** 3 of the Flows compliance + analytics roadmap
**Builds on:** Phase 2 + Phase 2.1 (shipped on main)
**Status:** Design — implementation starts immediately, target merge Monday night, demo Wednesday

## Goal

Deliver the user-visible A/B testing experience (wizard + send split + per-variant metrics + manual winner pick) for a Wednesday demo with Patrick, **skipping the auto-winner cron + statistical significance machinery** that a 30-minute demo can't exercise anyway. Schema lands complete so the cron becomes a non-migration follow-up later.

## Scope cut from the full Phase 3 spec

The original spec (`2026-04-17-flows-ab-testing-phase-3-design.md`, still archived for reference) includes an hourly cron job, statistical-significance winner selection, lift threshold, "undetermined" state, and staff-notification UI for indeterminate results. All of that runs on a 24-hour hold-out window timer — impossible to demo in a live call. **This spec cuts that entire chapter**; the manual "Pick winner → send to remainder" button is the only winner path.

## Non-goals (explicitly deferred)

- Hourly cron job (`abWinnerCron.ts`)
- Statistical significance test (lift threshold, min-sample gate, undetermined status)
- Auto-send to remainder after hold-out window
- "Undetermined — your call" notification banner
- Multi-armed bandit / continuous rebalancing
- Per-recipient personalization
- Cross-campaign A/B
- Manual sample-size calculator in the UI
- Small-segment hard-block enforcement (we'll keep the UI as-is — staff can manually decide not to A/B tiny segments)

## What this phase ships

### User-visible features
1. **Variants wizard** — up to 3 variants (A/B/C) with independent subject/body/promo editors, tab strip, add/remove controls.
2. **AI variant generation button** — "Generate with AI" reuses the existing `/api/business/:hospitalId/flows/compose` endpoint with a tweaked prompt.
3. **Send-time split** — at send time, 10% of the segment gets variant A, 10% gets variant B (or whatever the configured split is), 80% sit in hold-out with `variant_id = NULL`.
4. **Per-execution attribution token (`?fe=`)** — booking URL gains an HMAC-signed token binding `execution_id + variant_id` so per-variant booking counts are accurate.
5. **Per-variant breakdown in FlowMetrics** — drill-down page shows A-vs-B funnel side-by-side.
6. **Manual "Pick winner → send to remainder" button** — staff reviews early engagement, picks winner, clicks button, remaining 80% get the winning variant.

### Backend scaffolding (full, not trimmed)
- `flow_variants` table (id, flow_id, label, subject, template, promo_code_id, weight)
- `flow_executions.variant_id` (FK) + `booked_appointment_id` (FK)
- `referral_events.flow_execution_id` (FK)
- `flows` gets the A/B config columns: `ab_test_enabled`, `ab_holdout_pct_per_arm` (default 10), `ab_winner_variant_id`, `ab_winner_sent_at`, `ab_winner_status`

Columns the full spec has that are **dropped** from the migration: `ab_winner_metric`, `ab_holdout_window_hours`, `ab_min_sample_per_arm`, `ab_lift_threshold_pct` — all cron-side configuration that has no meaning without the cron job.

### Files

**New:**
- `migrations/0227_flows_ab_testing_demo.sql` — idempotent schema + partial indexes
- `server/services/marketingExecutionToken.ts` — HMAC-signed token (mirrors Phase 1's unsubscribe token, payload version `v: 2`)
- `server/services/marketingAbAssignment.ts` — `assignVariant(patient, flow, variants): { variant, sendNow }` deterministic hash bucketing
- `server/services/marketingAbSendRemainder.ts` — factored send logic used by the manual winner button
- `client/src/components/flows/VariantTabs.tsx`
- `client/src/components/flows/AbConfigSection.tsx` (minimal — split %, winner metric, AI generate)
- `tests/marketing-execution-token.test.ts`
- `tests/marketing-ab-assignment.test.ts`
- `tests/marketing-ab-send-remainder.test.ts`

**Modified:**
- `shared/schema.ts` — schema additions as above
- `server/routes/flows.ts` — send loop calls `assignVariant()` per patient, generates per-execution token, uses variant's template; new endpoint `POST /api/business/:hospitalId/flows/:flowId/pick-winner` for the manual button
- `server/routes/clinic.ts` — `/book` POST decodes `?fe=` and stamps `referral_events.flow_execution_id` + `flow_executions.booked_appointment_id`
- `server/services/marketingMetricsQuery.ts` — `flowDetail` returns per-variant breakdown when variants exist (extends existing query with `GROUP BY variant_id`)
- `client/src/pages/business/FlowCreate.tsx` — wires `<VariantTabs />` into the compose step; conditionally renders `<AbConfigSection />`
- `client/src/pages/business/Flows.tsx` — A/B badge on campaign rows when `ab_test_enabled`
- `client/src/pages/business/FlowMetrics.tsx` — per-variant comparison section + "Pick winner" buttons when `ab_winner_status IS NULL` and variants exist
- `server/routes/publicDocs.ts` — document `?fe=` URL param on booking link
- `tests/public-docs.test.ts` — assert `fe` documented

**NOT created in this phase (deferred):**
- `server/jobs/abWinnerCron.ts`
- `server/services/marketingAbEvaluation.ts`
- Any worker-registration changes
- Statistical significance tests

## Data model

### Migration 0227 (simplified)

```sql
-- Migration 0227: A/B testing — demo-grade (manual winner pick, no cron)
-- Idempotent.

CREATE TABLE IF NOT EXISTS "flow_variants" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "flow_id" varchar NOT NULL REFERENCES "flows"("id") ON DELETE CASCADE,
  "label" varchar(10) NOT NULL,
  "message_subject" varchar(300),
  "message_template" text NOT NULL,
  "promo_code_id" varchar REFERENCES "promo_codes"("id"),
  "weight" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_flow_variants_flow"
  ON "flow_variants" ("flow_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_flow_variants_flow_label"
  ON "flow_variants" ("flow_id", "label");

ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_test_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ab_holdout_pct_per_arm" integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "ab_winner_variant_id" varchar,
  ADD COLUMN IF NOT EXISTS "ab_winner_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "ab_winner_status" varchar(20);

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "variant_id" varchar
    REFERENCES "flow_variants"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "booked_appointment_id" varchar
    REFERENCES "clinic_appointments"("id") ON DELETE SET NULL;

ALTER TABLE "referral_events"
  ADD COLUMN IF NOT EXISTS "flow_execution_id" varchar
    REFERENCES "flow_executions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_variant"
  ON "flow_executions" ("variant_id")
  WHERE "variant_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_referral_events_flow_execution"
  ON "referral_events" ("flow_execution_id")
  WHERE "flow_execution_id" IS NOT NULL;
```

(Verify migration index is still 0227 at implementation time — main may have moved past it.)

## Send mechanics

### Variant assignment (deterministic hash)

For each patient in the segment:

```typescript
const bucket = parseInt(
  createHash("sha256")
    .update(`${patient.id}.${flow.id}`)
    .digest("hex")
    .slice(0, 8),
  16,
) % 100;

if (!flow.abTestEnabled) {
  return { variant: variants[0], sendNow: true };
}

const armPct = flow.abHoldoutPctPerArm; // default 10
const arms = variants.length; // 2 or 3
const initialSendPct = armPct * arms; // 20 or 30
if (bucket < initialSendPct) {
  const variantIdx = Math.floor(bucket / armPct);
  return { variant: variants[variantIdx], sendNow: true };
}
return { variant: null, sendNow: false }; // hold-out remainder
```

Hash is deterministic → re-running assignment gives same result. `sendNow: false` patients get a `flow_executions` row with `variantId = null` and `status = "pending"` — they sit idle until the manual winner button fires.

### Per-execution token in booking URL

When a variant gets sent to a patient, the booking URL gains:

```
?fe=<HMAC-signed {execution_id, variant_id, v: 2}>
```

Reuses Phase 1's HMAC pattern (`MARKETING_UNSUBSCRIBE_SECRET` + `timingSafeEqual`). Payload version `v: 2` to distinguish from unsubscribe tokens (`v: 1`). New helper `server/services/marketingExecutionToken.ts` mirrors `marketingUnsubscribeToken.ts` line-by-line but with the different payload shape.

### `/book` POST extension

When a patient submits the booking form, if `fe` URL param is present:
1. Decode via `verifyExecutionToken`
2. On appointment creation, stamp `referral_events.flow_execution_id` AND `flow_executions.booked_appointment_id`

If decode fails (tampered token), silently ignore — fall back to `utm_content` attribution (Phase 2). Don't block the booking.

## Manual winner flow (replaces cron)

### New endpoint

```
POST /api/business/:hospitalId/flows/:flowId/pick-winner
Body: { variantId: string }
```

Logic:
1. Verify staff has `isMarketingAccess`
2. Verify flow belongs to hospital, is in `ab_test_enabled: true`, `ab_winner_variant_id IS NULL`
3. Update `flows`: `ab_winner_variant_id = :variantId`, `ab_winner_status = 'manual'`, `ab_winner_sent_at = NOW()`
4. Find all `flow_executions` where `flow_id = :flowId AND variant_id IS NULL AND status = 'pending'`
5. For each, assign `variant_id = winnerVariantId`, generate per-execution token, dispatch send via the existing send path (factored into `marketingAbSendRemainder.ts`)
6. Return count of remainder-sent executions

Respects consent filter (Phase 1) via the existing send-loop's patient query — opted-out patients are skipped naturally.

### Frontend — "Pick winner" buttons

In `FlowMetrics.tsx`, when `flow.ab_test_enabled` AND `flow.ab_winner_variant_id IS NULL`:

```tsx
<div className="mt-4 border-t pt-4 flex gap-2">
  <Button onClick={() => pickWinner("A")}>
    {t("flows.ab.pickA", "Send Variant A to remainder")}
  </Button>
  <Button onClick={() => pickWinner("B")}>
    {t("flows.ab.pickB", "Send Variant B to remainder")}
  </Button>
</div>
```

When `ab_winner_variant_id IS NOT NULL`, show a badge instead: *"Winner: B · sent to remainder 2026-04-22"*.

## Wizard changes

### Compose step — variant tabs

Replace the single message editor with a tab strip:

```
[Variant A] [Variant B] [+]                [✨ Generate with AI]
┌────────────────────────────────────────────────────────┐
│ Subject: ...                                           │
│ Body:    ...                                           │
│ Promo:   ... (optional, per-variant)                   │
└────────────────────────────────────────────────────────┘
```

- Max 3 variants (A/B/C). Beyond 3 the "+" disappears.
- Adding a second variant auto-enables `abTestEnabled`.
- Removing all but one variant reverts to single-message mode (disables `abTestEnabled`).
- "Generate with AI" calls `/compose` with a prompt like *"Rewrite the previous variant for an A/B test — different angle, same offer."* Pre-fills the new variant.

### Optional A/B config section (appears when 2+ variants)

```
A/B Test config:
  Hold-out split per arm: [10%] [15%] [20%]  (rest wait for winner)

  Winner metric displayed: Booking rate (fixed — simplest signal for demo)
```

No cron-related fields in this phase (window hours, min sample, lift threshold all deferred).

## Per-variant metrics

Existing `flowDetail(flowId)` query gets a per-variant extension. New return shape:

```typescript
{
  funnel: { sent, delivered, opened, clicked, bounced, complained, bookings, revenue },
  perVariant?: Array<{
    variantId: string;
    label: string; // "A", "B", "C"
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bookings: number;
    revenue: number;
  }>;
  bounces, complaints, series; // as before
}
```

`perVariant` is populated only when the flow has variants. Implementation: one extra SQL query grouping by `flow_executions.variant_id`.

### `FlowMetrics.tsx` comparison section

Rendered above the existing aggregate funnel (which stays as the overall roll-up):

```
Variant comparison

         Variant A     Variant B
Sent      34           34
Opened    12 (35%)     19 (56%)
Clicked   4            9
Booked    1            4
Revenue   CHF 1,200    CHF 4,800
                       ★ Winner (if picked)
```

## Operational notes

### For the demo itself

You'll want either:
- **Real Resend webhook wired to dev** (via ngrok / Cloudflare Tunnel) so live opens/clicks appear during the demo — realistic but has setup overhead
- **Seed demo data script** — a small dev-only script that populates `flow_executions` + `flow_events` + `referral_events` rows for a fake campaign so the dashboard shows non-zero numbers immediately

I'd include a tiny seed script (`server/scripts/seedAbDemo.ts`) as part of this phase — 30 minutes of work — callable via `npm run seed:ab-demo` or similar. Makes the demo bulletproof.

### Env vars

No new env vars. `MARKETING_UNSUBSCRIBE_SECRET` (Phase 1) is reused for the execution token.

### Migration behavior

- Existing non-A/B campaigns continue to work — `ab_test_enabled` defaults to false. Send loop calls `assignVariant()` but the helper returns the single variant immediately when `ab_test_enabled = false`.
- Migration 0227 is additive; rollback = drop the new table and columns (safe).

## Test coverage

| File | Scenarios |
|---|---|
| `marketing-execution-token.test.ts` | Round-trip; tampered payload; tampered sig; malformed; rejection vs `v:1` unsubscribe token |
| `marketing-ab-assignment.test.ts` | Deterministic hash per patient; 10% split puts ~10 patients per arm on a 100-patient segment; `abTestEnabled=false` always returns first variant; hold-out remainder returns `sendNow=false` |
| `marketing-ab-send-remainder.test.ts` | Manual pick-winner sends only to pending executions; stamps variant_id on each; respects Phase 1 consent filter; skips already-unsubscribed patients |

+3 test files, ~15 test assertions. Combined with Phase 1+2+2.1 tests, total marketing test count lands around ~75.

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Cut cron + auto-winner selection from this phase | Can't be demoed in 30 min; schema-complete means it can be added later without a new migration |
| 2 | Keep hold-out split mechanics | The manual "Pick winner → send to remainder" button is the demo value prop; both require a hold-out remainder |
| 3 | Max 3 variants (A/B/C) | Matches full spec; beyond 3, arms too thin |
| 4 | Deterministic hash bucketing for variant assignment | Re-runnable; no state needed in DB until send |
| 5 | Per-execution HMAC token reuses Phase 1 pattern with `v:2` payload | Zero new crypto code; consistent error messages |
| 6 | AI variant generation via existing `/compose` endpoint | One new prompt variant; no new backend |
| 7 | Winner metric display hardcoded to "booking rate" | No UI for selection in demo phase; can be added later if needed |
| 8 | Seed demo data script included | Makes the demo bulletproof without requiring live Resend webhook setup |
| 9 | `ab_winner_status = 'manual'` stamped when staff picks winner | Preserves the full-spec distinction for when cron is added later |

## What this branch ENABLES on the marketing page

After Phase 3 (demo-grade) ships:
- ✅ "Run A/B tests on subject lines and offers" — true
- ✅ "AI generates variant copy" — true (variant generation via `/compose`)
- ⚠️ "System automatically picks the winning variant" — not yet; staff picks manually
- ⚠️ "Winner is sent to the remainder of your segment automatically" — not yet; staff clicks a button
- ✅ "Track per-variant performance" — true

Two of the marketing claims remain aspirational until the cron + significance chapter ships as a follow-up. For a demo it's fine; for a real customer deploy, the follow-up should land before Flows is turned on for any paying customer.

## Estimated scope

~800 lines of code (vs ~1500 for full spec), ~15 tests (vs ~35), ~1 day focused implementation. Seed script +30 min. Total ~1.5 days → merge Monday night → buffer for Tuesday polish → Wednesday demo safe.

## Phase 3.1 hand-off (post-demo)

The cron + auto-winner layer ships later as:
- `server/jobs/abWinnerCron.ts` — new file, registered in `worker.ts`
- `server/services/marketingAbEvaluation.ts` — `evaluateAbWinner()` + statistical threshold check
- 4 new `flows` columns (`ab_winner_metric`, `ab_holdout_window_hours`, `ab_min_sample_per_arm`, `ab_lift_threshold_pct`) — migration 0228 or later
- UI additions: winner metric selector, hold-out window selector, "undetermined" banner + manual override reuses the Phase 3 button

No demo-phase code needs to change for the follow-up — additive only.
