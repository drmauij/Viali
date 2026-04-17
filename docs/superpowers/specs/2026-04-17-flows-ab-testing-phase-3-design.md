# Flows A/B Testing (Phase 3) — Design Spec

**Date:** 2026-04-17
**Phase:** 3 of the Flows compliance + analytics roadmap
**Builds on:** Phase 2 (event tracking — Resend webhook + per-campaign metrics)
**Status:** Design — pending Phase 2 ship before implementation begins

## Goal

Let staff create campaigns with multiple message variants (A/B/C), send each variant to a small hold-out sample of the segment, and have the system automatically pick a winner after a configurable hold-out window and send the winning variant to the rest of the segment. Closes the last big lie on the viali.app/flows marketing page: *"AI generates variants and the system automatically applies the winner to the full segment."*

## Why this scope (and not more)

- A/B testing is the single most-cited "missing feature" on the public marketing page — Phase 1 closed compliance, Phase 2 closed engagement tracking, Phase 3 closes the last claim.
- The full multi-armed-bandit / continuous-rebalancing approach used by enterprise ESPs is out of scope: it adds substantial complexity (real-time traffic rebalancing, Bayesian inference, posterior updating) for marginal lift over hold-out + winner-selection in our segment-size regime (typically 50–500 patients per campaign in aesthetic clinics).
- AI variant generation is included because it removes the dominant friction in real-world A/B adoption (staff don't write variant B if the alternative is a blank text box) and the existing `/compose` AI endpoint shipped in earlier work makes it a 15-line addition.

## Non-goals

- Multi-armed bandit / real-time traffic rebalancing — Phase 4+ if customer demand emerges
- Bayesian or chi-square significance testing — start with a simple threshold; advanced statistical tests can be a switchable mode later
- Per-recipient personalization (dynamic content blocks based on patient attributes) — separate concern
- Subject-line-only test mode as a separate feature — variants can differ in any field; staff just changes only the subject if that's what they want to test
- Cross-campaign A/B (one variant pulled from one flow, one from another) — overcomplication
- Manual sample-size calculator UI — the system enforces a minimum (30 conversions per arm); a calculator would be staff-friendly but is YAGNI

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Wizard                                │
│ Segment → Channel → Compose (variants A/B/C) → A/B config →  │
│ Review → Send                                                │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────┐
                    │   Send loop          │
                    │   - holdout split:   │
                    │     hash(patient_id+ │
                    │     flow_id) → arm   │
                    │   - stamp variant_id │
                    │     on each          │
                    │     flow_execution   │
                    │   - per-execution    │
                    │     HMAC token in    │
                    │     booking URL      │
                    └─────────┬────────────┘
                              │
                              ▼
            ┌─────────────────────────────────────┐
            │   Initial sends: 10% to A, 10% to B │
            │   80% sit idle (variant_id NULL)    │
            └─────────────────┬───────────────────┘
                              │
                              ▼ wait holdout_window_hours
            ┌─────────────────────────────────────┐
            │  Hourly cron: find flows with       │
            │  ab_test_enabled, no winner yet,    │
            │  past holdout deadline              │
            └─────────────────┬───────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────────┐
            │  Compute per-variant metrics from   │
            │  flow_events + referral_events      │
            │  (per-execution attribution token)  │
            └─────────────────┬───────────────────┘
                              │
                       ┌──────┴──────┐
                       ▼             ▼
              ┌────────────┐  ┌─────────────────┐
              │ Threshold  │  │ Threshold not   │
              │ met        │  │ met / tied      │
              └─────┬──────┘  └────┬────────────┘
                    │              │
                    ▼              ▼
        ┌──────────────────┐  ┌─────────────────────┐
        │ Mark winner;     │  │ Mark "undetermined" │
        │ send winner to   │  │ Notify staff;       │
        │ remainder        │  │ wait for manual pick│
        └──────────────────┘  └─────────────────────┘
```

## Data model

### New table: `flow_variants`

```typescript
export const flowVariants = pgTable("flow_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => flows.id, { onDelete: 'cascade' }),
  label: varchar("label", { length: 10 }).notNull(), // "A", "B", "C"
  messageSubject: varchar("message_subject", { length: 300 }),
  messageTemplate: text("message_template").notNull(),
  promoCodeId: varchar("promo_code_id").references(() => promoCodes.id),
  weight: integer("weight").notNull().default(1), // currently always 1; reserved for future weighted splits
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_flow_variants_flow").on(table.flowId),
  uniqueIndex("uniq_flow_variants_flow_label").on(table.flowId, table.label),
]);
```

### Schema changes to existing tables

```typescript
// flows table — A/B configuration
export const flows = pgTable("flows", {
  // ... existing columns ...
  abTestEnabled: boolean("ab_test_enabled").default(false).notNull(),
  abHoldoutPctPerArm: integer("ab_holdout_pct_per_arm").default(10).notNull(),
  abWinnerMetric: varchar("ab_winner_metric", { length: 20 }).default("booking_rate"),
  abHoldoutWindowHours: integer("ab_holdout_window_hours").default(24).notNull(),
  abMinSamplePerArm: integer("ab_min_sample_per_arm").default(30).notNull(),
  abLiftThresholdPct: integer("ab_lift_threshold_pct").default(20).notNull(),
  abWinnerVariantId: varchar("ab_winner_variant_id"),
  abWinnerSentAt: timestamp("ab_winner_sent_at"),
  abWinnerStatus: varchar("ab_winner_status", { length: 20 }), // "pending" | "decided" | "undetermined" | "manual"
});

// flow_executions table — variant assignment
export const flowExecutions = pgTable("flow_executions", {
  // ... existing columns + Phase 2's resendEmailId ...
  variantId: varchar("variant_id").references(() => flowVariants.id, { onDelete: 'set null' }),
});
```

The `variantId` on `flow_executions` is nullable because:
- Pre-Phase-3 executions have no variant
- Hold-out remainder executions (created when winner is sent) get the winner variant id
- Single-variant (non-A/B) flows leave it null

### Booking attribution change

Phase 2 added `utm_content = flow.id` to the booking URL — sufficient for "which campaign drove this booking." Phase 3 needs **per-execution** attribution because the same flow has multiple variants. The booking URL gains:

```
?fe=<HMAC-signed { execution_id, variant_id, v: 2 }>
```

Reuses Phase 1's HMAC pattern (`server/services/marketingUnsubscribeToken.ts`) — same secret resolution (`MARKETING_UNSUBSCRIBE_SECRET` with `SESSION_SECRET` fallback), same constant-time comparison. New helper `marketingExecutionToken.ts` mirrors the unsubscribe-token module exactly but with payload version `v: 2` to distinguish.

When `/book` POST creates an appointment, it reads `?fe=`, decodes via `verifyExecutionToken`, and writes `referral_events.flow_execution_id` (new nullable column) plus `flow_executions.bookedAppointmentId` (new nullable column). Existing `utm_content` keeps working as the per-campaign join key for non-A/B flows.

```typescript
// referral_events table addition
flowExecutionId: varchar("flow_execution_id").references(() => flowExecutions.id, { onDelete: 'set null' }),

// flow_executions table addition
bookedAppointmentId: varchar("booked_appointment_id").references(() => clinicAppointments.id, { onDelete: 'set null' }),
```

### Migration

```sql
-- Migration 0223: A/B testing schema for Flows campaigns
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
  ADD COLUMN IF NOT EXISTS "ab_winner_metric" varchar(20) DEFAULT 'booking_rate',
  ADD COLUMN IF NOT EXISTS "ab_holdout_window_hours" integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "ab_min_sample_per_arm" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "ab_lift_threshold_pct" integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "ab_winner_variant_id" varchar,
  ADD COLUMN IF NOT EXISTS "ab_winner_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "ab_winner_status" varchar(20);

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "variant_id" varchar REFERENCES "flow_variants"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "booked_appointment_id" varchar REFERENCES "clinic_appointments"("id") ON DELETE SET NULL;

ALTER TABLE "referral_events"
  ADD COLUMN IF NOT EXISTS "flow_execution_id" varchar REFERENCES "flow_executions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_variant"
  ON "flow_executions" ("variant_id")
  WHERE "variant_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_referral_events_flow_execution"
  ON "referral_events" ("flow_execution_id")
  WHERE "flow_execution_id" IS NOT NULL;
```

## Wizard flow changes

### Step 3 (Compose) — variant tabs

The compose step replaces its single editor with a tab strip:

```
[Variant A]  [Variant B]  [+]                       [✨ Generate with AI]
┌─────────────────────────────────────────────────────────┐
│ Subject:  Spring Glow — 20% Rabatt                      │
│ Body:     Liebe Maria, ...                              │
│ Promo:    SPRING20 (or none)                            │
└─────────────────────────────────────────────────────────┘
```

- Up to **3 variants (A/B/C)**. Beyond 3, hold-out arms get too thin to ever achieve significance.
- Each variant has independent subject, body, and (optional) promo code. Same channel and segment as the parent flow — these are not test variables.
- Per-variant promo code overrides `flows.promoCodeId` at send time. The legacy `flows.promoCodeId` remains as the default for single-variant (non-A/B) flows; A/B flows ignore it in favor of each variant's own `promoCodeId`.
- "Generate with AI" calls existing `/api/business/:hospitalId/flows/compose` with a tweaked prompt: *"Rewrite the previous variant for an A/B test — different angle, same offer."* Pre-fills the new variant's body and subject.
- Removing a variant when only one remains disables the variant tab strip and reverts to single-message mode.

### New step 4 — A/B configuration (only shown if 2+ variants exist)

```
A/B Test:
  ☑ Run as A/B test  (auto-enabled when 2+ variants)

  Hold-out split per arm: ●10%  ○15%  ○20%
                          (rest of segment waits for the winner)

  Decide winner by:       ○ Highest open rate
                          ○ Highest click rate
                          ● Highest booking rate (default)

  Hold-out window:        24 hours  (configurable: 12 / 24 / 48 / 168)

  Lift threshold:         20%  (variant must beat the others by ≥X% to win)

  Min sample per arm:     30 conversions

  ▼ Auto-send winner to remainder if threshold met (else: notify me to decide)
    ☑ enabled
```

Defaults are filled in from the columns shown in the schema. Most staff will never touch them.

### Small-segment block

If `segmentCount * holdoutPctPerArm / 100 < minSamplePerArm`, the wizard:
- Disables the A/B toggle in step 4
- Shows tooltip: *"Segment too small for A/B (would only give X patients per arm — needs at least Y for a meaningful winner). Send as a single variant, or run A/B on a larger segment next month."*
- Computed live as the segment filters change.

### Review step

Shows the per-variant breakdown:
> *"We'll send variant A to 34 patients and variant B to 34 patients now. Remaining 270 patients will receive the winning variant after 24 hours."*

For non-A/B flows, the review step is unchanged.

## Send mechanics

### Variant assignment (deterministic)

Per patient in the segment:

```typescript
// Hash patient_id + flow_id into [0, 100). Stable per patient — re-running
// the assignment gives the same result.
const bucket = parseInt(
  createHash("sha256")
    .update(`${patient.id}.${flow.id}`)
    .digest("hex")
    .slice(0, 8),
  16,
) % 100;

if (!flow.abTestEnabled) {
  // single variant — no holdout
  return { variant: variants[0], sendNow: true };
}

const armPct = flow.abHoldoutPctPerArm; // e.g., 10
const arms = variants.length;            // 2 or 3
const initialSendPct = armPct * arms;    // 20 or 30
if (bucket < initialSendPct) {
  // Round-robin assign to one of the variants
  const variantIdx = Math.floor(bucket / armPct);
  return { variant: variants[variantIdx], sendNow: true };
}
return { variant: null, sendNow: false }; // hold-out remainder
```

`sendNow: false` patients get a `flow_executions` row with `variantId = null` and `status = "pending"`. They sit idle waiting for the cron-determined winner.

### Per-execution token in booking URL

After a `flow_executions` row is created, the booking URL is built per-recipient:

```typescript
const fe = generateExecutionToken(execution.id, execution.variantId);
const bookingUrl = `${baseBookingUrl}?service=${...}&promo=${...}&utm_content=${flow.id}&fe=${fe}`;
```

`utm_content = flow.id` from Phase 2 stays — supports the legacy join key path. `fe=` adds the per-execution layer.

### `/book` POST extension

When a patient submits the booking form, the existing `/api/clinic/.../book` endpoint already accepts the URL params. New extension: if `fe` is present, decode via `verifyExecutionToken`, then on appointment creation:
- Stamp `referral_events.flow_execution_id`
- Stamp `flow_executions.booked_appointment_id`
- (existing UTM stamping continues)

If decode fails (tampered token), silently ignore — fall back to UTM-only attribution. Don't block the booking.

## Winner selection (hourly cron)

### Cron job

A new background job runs hourly via the existing worker pattern (see `server/worker.ts` for cron infrastructure). Pseudo-code:

```typescript
// Find A/B flows past their hold-out window with no winner yet
const candidates = await db.select().from(flows).where(and(
  eq(flows.abTestEnabled, true),
  isNull(flows.abWinnerVariantId),
  isNull(flows.abWinnerStatus), // not "decided" or "undetermined" yet
  sql`${flows.sentAt} + (${flows.abHoldoutWindowHours} * INTERVAL '1 hour') <= NOW()`,
));

for (const flow of candidates) {
  await evaluateAbWinner(flow);
}
```

### `evaluateAbWinner(flow)` logic

```typescript
async function evaluateAbWinner(flow: Flow) {
  const variants = await getVariants(flow.id);
  const metrics = await Promise.all(
    variants.map(v => computeVariantMetrics(flow.id, v.id, flow.abWinnerMetric))
  );

  // metrics[i] = { variantId, conversions, sampleSize, rate }

  // Min sample gate
  const allMeetMin = metrics.every(m => m.conversions >= flow.abMinSamplePerArm);
  if (!allMeetMin) {
    await markUndetermined(flow.id, "Insufficient sample on at least one arm");
    return;
  }

  // Find best by rate
  const sorted = metrics.sort((a, b) => b.rate - a.rate);
  const best = sorted[0];
  const second = sorted[1];

  // Lift threshold gate
  const lift = (best.rate - second.rate) / second.rate;
  if (lift * 100 < flow.abLiftThresholdPct) {
    await markUndetermined(flow.id, `Lift only ${(lift * 100).toFixed(1)}%`);
    return;
  }

  // Winner!
  await markWinnerAndSendRemainder(flow, best.variantId);
}
```

### `markWinnerAndSendRemainder(flow, winnerVariantId)`

1. `UPDATE flows SET ab_winner_variant_id = ?, ab_winner_status = 'decided', ab_winner_sent_at = NOW() WHERE id = ?`
2. Find all `flow_executions` for this flow with `variant_id IS NULL` AND `status = 'pending'`
3. For each: assign `variant_id = winnerVariantId`, generate per-execution token, send via the same SMS/email path as the initial send, write `flow_event` rows for `sent` (and webhook events flow in as patients engage).
4. The send loop reuses the existing email/SMS channel logic — only the variant template + per-execution token change.

### `markUndetermined(flow, reason)`

`UPDATE flows SET ab_winner_status = 'undetermined' WHERE id = ?`

The dashboard then surfaces a banner: *"A/B test inconclusive — staff decision required"* with two buttons: "Send variant A to remainder" and "Send variant B to remainder" (and Cancel = leave 80% un-contacted).

### Manual override

Even before the hold-out window expires, staff can manually mark a winner via the metrics drill-down page. Sets `ab_winner_status = 'manual'`, otherwise same effect as auto-decide.

## Frontend changes

### `client/src/pages/business/FlowCreate.tsx`

The compose section gets a `<VariantTabs />` component (new). When the user adds a second variant, an A/B-config section appears below channel selection.

### New `client/src/components/flows/VariantTabs.tsx`

- Manages an array of `{ label, subject, template, promoCodeId }` in local state
- Tabs at top, content area below per the wizard mockup
- "+" button to add (capped at 3)
- "✨ Generate with AI" button calls `/compose` with a special A/B prompt
- Trash icon per tab to remove

### New `client/src/components/flows/AbConfigSection.tsx`

- Renders the A/B configuration form (split, metric, window, lift, min sample, auto-send toggle)
- Shows the small-segment warning when applicable (computed from current segment count)
- Hidden when only one variant exists

### `client/src/pages/business/Flows.tsx` (Phase 2's list view)

- Each campaign row shows A/B status badge if applicable: "A/B in holdout (12h left)", "A/B winner: B", "A/B undetermined — your call"
- The per-row mini-strip shows variant breakdown when expanded

### `client/src/pages/business/FlowMetrics.tsx` (Phase 2's drill-down)

- Add a per-variant comparison section above the time-series chart:
  ```
  Variant A     Variant B     Winner
  Sent     34   Sent     34   ★ B (4× lift, decided 2026-04-19)
  Opened   12   Opened   19
  Clicked  4    Clicked  9
  Booked   1    Booked   4
  ```
- For undetermined campaigns, show the "Send winner manually" buttons

## File structure

### New files

| Path | Purpose |
|---|---|
| `migrations/0223_flows_ab_testing.sql` | Schema changes (flow_variants table + columns on flows/flow_executions/referral_events) |
| `server/services/marketingExecutionToken.ts` | HMAC token for per-execution attribution (mirrors marketingUnsubscribeToken.ts) |
| `server/services/marketingAbAssignment.ts` | `assignVariant(patient, flow, variants)` deterministic bucketing |
| `server/services/marketingAbEvaluation.ts` | `evaluateAbWinner(flow)`, `computeVariantMetrics()`, `markUndetermined()`, `markWinnerAndSendRemainder()` |
| `server/services/marketingAbSendRemainder.ts` | Sends the winning variant to hold-out patients (factored from the existing send-loop logic) |
| `server/jobs/abWinnerCron.ts` | Hourly cron handler (registered in worker) |
| `client/src/components/flows/VariantTabs.tsx` | Variant editor with AI generate button |
| `client/src/components/flows/AbConfigSection.tsx` | A/B configuration form |
| `tests/marketing-execution-token.test.ts` | Token round-trip / tamper / different secret |
| `tests/marketing-ab-assignment.test.ts` | Deterministic bucketing; small-segment edge cases |
| `tests/marketing-ab-evaluation.test.ts` | Winner selection: threshold met, threshold not met, insufficient sample, tied rates |
| `tests/marketing-ab-send-remainder.test.ts` | Hold-out remainder send respects consent (Phase 1) and writes flow_events (Phase 2) |
| `tests/flows-ab-integration.test.ts` | End-to-end: create flow with 2 variants, send, simulate webhook events, run cron, verify winner sent |

### Modified files

| Path | Change |
|---|---|
| `shared/schema.ts` | New `flowVariants` table; A/B columns on `flows`; `variantId`/`bookedAppointmentId` on `flowExecutions`; `flowExecutionId` on `referralEvents` |
| `server/routes/flows.ts` | Send loop calls `assignVariant()` per patient, generates per-execution token, uses variant template; new endpoint `POST /api/business/:hospitalId/flows/:flowId/send-winner-manual` for staff override |
| `server/routes/clinic.ts` | `/book` POST decodes `?fe=` token and stamps `referral_events.flow_execution_id` + `flow_executions.booked_appointment_id` on appointment creation |
| `server/worker.ts` | Register `abWinnerCron.ts` to run hourly |
| `client/src/pages/business/FlowCreate.tsx` | Replace single message editor with `<VariantTabs />`; conditionally render `<AbConfigSection />` |
| `client/src/pages/business/Flows.tsx` | Show A/B status badges and per-variant breakdown in row strip |
| `client/src/pages/business/FlowMetrics.tsx` | Add per-variant comparison section; undetermined-state UI |
| `server/routes/publicDocs.ts` | Document `?fe=` URL param on the booking link |
| `tests/public-docs.test.ts` | Assert `fe` param documented |

## Test coverage summary

| Test file | Scenarios |
|---|---|
| `marketing-execution-token.test.ts` | Round-trip; tampered payload; tampered signature; malformed; rejection vs Phase 1 unsubscribe-token (different `v` field) |
| `marketing-ab-assignment.test.ts` | Hash is deterministic per patient; 10/10 split lands ~10 patients per arm in 100-patient segment; `abTestEnabled=false` always returns first variant; small-segment edge case (when `segmentSize * pct < min`) returns single-variant mode |
| `marketing-ab-evaluation.test.ts` | Winner picked when threshold + min sample met; undetermined when sample too small; undetermined when lift below threshold; tied rates → undetermined; per-metric correctness for booking_rate / open_rate / click_rate; manual override sets `ab_winner_status = 'manual'` |
| `marketing-ab-send-remainder.test.ts` | Remainder send respects consent filter (Phase 1) — opted-out patients skipped; writes `flow_event` rows for `sent`; per-execution token in booking URL; updates `flow_executions` with winner variant_id |
| `flows-ab-integration.test.ts` | Full happy path: create 2-variant flow, send, simulate webhook opens/clicks, run cron after window expires, verify winner decided and remainder sent |

Estimated +35 new tests on top of Phase 1's 33 + Phase 2's 20 = 88 total marketing tests across the three phases.

## Operational rollout

### Pre-deploy

1. No new env vars (reuses `MARKETING_UNSUBSCRIBE_SECRET` for execution tokens).
2. Confirm `server/worker.ts` worker process is running on the VPS — Phase 3's cron lives there.

### After deploy

1. Run migration 0223. Idempotent.
2. Existing campaigns (with `ab_test_enabled = false` defaulted) keep working as single-variant — zero behavior change.
3. Send a test A/B campaign to two test addresses with manual variant labels. Verify each gets a different variant; check `flow_executions.variant_id` populated.
4. Manually advance one execution's clock (or shorten the hold-out window for testing) and trigger the cron handler to verify winner selection logic.
5. Click the winning variant's tracked link from the test inbox; confirm the new appointment's `referral_events.flow_execution_id` is set and the metrics drill-down shows the conversion attributed to the right variant.

### Rollback safety

Phase 3 is mostly additive. The one risk is the send loop's variant assignment — if a regression makes `assignVariant()` return wrong values, ALL new flows are affected. Mitigation: send-loop changes are TDD'd with deterministic test fixtures.

If the cron job misbehaves: disable it (comment out the registration in `worker.ts`). Manually-marked winners still work; auto-decide just stops happening.

## Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Up to 3 variants (A/B/C max) | Beyond 3, hold-out arms too thin for significance. Most ESPs cap there. |
| 2 | Hold-out + winner approach (not 50/50 simul, not multi-armed bandit) | Standard SaaS shape; matches marketing-page claim; bandit complexity unwarranted at our segment scale |
| 3 | Simple lift-threshold winner test (not chi-square or Bayesian) | Easy to explain to non-statisticians; deterministic; advanced statistical modes can ship later as opt-in |
| 4 | Default winner metric: booking_rate; selectable per-campaign | Booking is the actual money signal; flexibility for staff who want top-of-funnel data |
| 5 | Defaults: 10% per arm, 24h window, 30 conversions/arm min, 20% lift threshold | Industry-standard for clinic-scale audiences; per-campaign override available |
| 6 | Hard-block A/B for small segments (computed from min sample requirement) | Clearest UX; prevents disappointment when "undetermined" fires every time |
| 7 | AI variant generation included in Phase 3 | Reuses existing `/compose` endpoint; removes the dominant friction in real-world A/B adoption; lands the marketing claim |
| 8 | Per-execution HMAC token (`?fe=`) for attribution | Required for variant-level booking attribution; reuses Phase 1 token pattern with `v: 2` payload version; falls back to Phase 2 `utm_content` for non-A/B flows |
| 9 | Deterministic hash bucketing for variant assignment | Re-running assignment gives same result (idempotent); no state needed in DB until first send |
| 10 | Manual override available pre-cron + on-undetermined | Staff retain control; auto is the happy path, not a forced behavior |
| 11 | Cron runs hourly | 1-hour resolution is fine for hold-out windows of 12+ hours; reuses existing worker infrastructure |
| 12 | `flow_executions.variant_id` nullable | Pre-Phase-3 executions have no variant; hold-out remainder is null until winner determined; non-A/B flows leave it null |

## What this branch ENABLES on the marketing page

After Phase 3 ships:
- ✅ "Run A/B tests on subject lines and offers" — true
- ✅ "AI generates variant copy" — true (variant generation reuses /compose)
- ✅ "System automatically picks the winning variant" — true (cron after hold-out)
- ✅ "Winner is sent to the remainder of your segment automatically" — true
- ✅ "Track per-variant performance" — true (drill-down comparison view)

Everything else on viali.app/flows that was claimed pre-Phase-1 is now real or honestly removable.

## Open question for future iteration (NOT this phase)

Should the "A/B winner" logic also support sending variant A to one segment AND variant B to a different segment (i.e., "static segmentation") instead of "random split within a segment"? This is a different feature — would let staff target different value props to different patient personas without random assignment. Out of scope for Phase 3, but worth considering if customers ask.
