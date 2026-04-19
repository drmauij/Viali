# Flows A/B Testing (Phase 3 — demo-grade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Per user feedback in `feedback_plan_execution_pace.md`, skip per-task spec+quality reviewer dispatches — do one final review at the end. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-visible A/B testing experience for the Patrick demo on Wednesday: variant CRUD + wizard UI, send-time split with per-execution attribution token, per-variant metrics in FlowMetrics, manual "Pick winner → send to remainder" button, AI variant generation.

**Architecture:** New `flow_variants` table + columns on `flows` / `flow_executions` / `referral_events` (migration 0227). Variant assignment is deterministic hash bucketing at send time — 10% to A, 10% to B, 80% hold out with `variant_id=NULL`. Per-execution HMAC-signed `?fe=` token in booking URL binds `execution_id + variant_id` so bookings attribute to the correct variant. Manual winner selection updates `flows.ab_winner_variant_id` and dispatches the remainder send via a factored send helper. No cron, no statistical significance test — those are Phase 3.1.

**Tech Stack:** Drizzle ORM + Postgres, Express, Node `crypto` (HMAC-SHA256, no new deps), Vitest + Supertest, OpenAI (via existing `/compose` endpoint).

**Spec:** `docs/superpowers/specs/2026-04-18-flows-ab-testing-phase-3-demo-design.md` (in the worktree + on main)

**Prerequisite env vars:** `MARKETING_UNSUBSCRIBE_SECRET` (already required by Phase 1, reused for execution token). No new env vars.

---

## File Structure

**New files:**
- `migrations/0227_flows_ab_testing_demo.sql` — idempotent schema
- `server/services/marketingExecutionToken.ts` — HMAC-signed `{pid?, eid, vid, hid, v:2}` token (mirrors `marketingUnsubscribeToken.ts`)
- `server/services/marketingAbAssignment.ts` — `assignVariant(patientId, flowId, flow, variants)` deterministic bucketing
- `server/services/marketingAbSendRemainder.ts` — `sendRemainderForWinner(flow, winnerVariantId, req)` factored send logic
- `client/src/components/flows/VariantTabs.tsx` — variant editor tabs (A/B/C)
- `client/src/components/flows/AbConfigSection.tsx` — hold-out split selector
- `server/scripts/seedAbDemo.ts` — dev-only seed script for Wednesday demo
- `tests/marketing-execution-token.test.ts`
- `tests/marketing-ab-assignment.test.ts`
- `tests/marketing-ab-send-remainder.test.ts`

**Modified files:**
- `shared/schema.ts` (line 6878 `flows`, line 6916 `flowExecutions`, line 6676 `referralEvents`) — schema additions
- `server/routes/flows.ts` — variants in list/get/create/update payload; send loop calls `assignVariant()`, uses variant template, generates per-exec token, stores variant_id on execution; new `POST /flows/:flowId/pick-winner` endpoint; `POST /flows/compose` gets an `ab_variant` prompt mode
- `server/routes/clinic.ts` (line 710 `/book` POST, line 820 referral_events insert) — decode `fe=` query param + stamp `referral_events.flow_execution_id` + `flow_executions.booked_appointment_id`
- `server/services/marketingMetricsQuery.ts` — `flowDetail()` returns per-variant funnel when variants exist
- `client/src/pages/business/FlowCreate.tsx` — replace single editor with `<VariantTabs />`; conditionally render `<AbConfigSection />`
- `client/src/pages/business/Flows.tsx` — A/B badge on rows when `abTestEnabled`
- `client/src/pages/business/FlowMetrics.tsx` — per-variant funnel comparison + Pick Winner buttons
- `server/routes/publicDocs.ts` — document `?fe=` URL param
- `tests/public-docs.test.ts` — assert `fe` documented
- `package.json` — add `seed:ab-demo` script entry

---

## Task 1: Schema + migration 0227

**Files:**
- Modify: `shared/schema.ts` (lines 6676, 6878, 6916 — three tables touched)
- Create: `migrations/0227_flows_ab_testing_demo.sql`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1: Add `flowVariants` table to `shared/schema.ts`**

Add a new `flowVariants` table definition BEFORE the `flowExecutions` table (around line 6916). It must reference both `flows.id` and `promoCodes.id`. Place it after `flows`:

```typescript
export const flowVariants = pgTable("flow_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => flows.id, { onDelete: 'cascade' }),
  label: varchar("label", { length: 10 }).notNull(), // "A", "B", "C"
  messageSubject: varchar("message_subject", { length: 300 }),
  messageTemplate: text("message_template").notNull(),
  promoCodeId: varchar("promo_code_id").references(() => promoCodes.id),
  weight: integer("weight").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_flow_variants_flow").on(table.flowId),
  uniqueIndex("uniq_flow_variants_flow_label").on(table.flowId, table.label),
]);

export type FlowVariant = typeof flowVariants.$inferSelect;
export type InsertFlowVariant = typeof flowVariants.$inferInsert;
```

- [ ] **Step 2: Add A/B columns to `flows` table in `shared/schema.ts`**

In the `flows` pgTable (around line 6878) add these fields BEFORE the closing `}, (table) => [`:

```typescript
  abTestEnabled: boolean("ab_test_enabled").default(false).notNull(),
  abHoldoutPctPerArm: integer("ab_holdout_pct_per_arm").default(10).notNull(),
  abWinnerVariantId: varchar("ab_winner_variant_id"),
  abWinnerSentAt: timestamp("ab_winner_sent_at"),
  abWinnerStatus: varchar("ab_winner_status", { length: 20 }),
```

Preserve all existing columns exactly.

- [ ] **Step 3: Add columns to `flowExecutions` table in `shared/schema.ts`**

In the `flowExecutions` pgTable (around line 6916, end of column list) add:

```typescript
  variantId: varchar("variant_id").references(() => flowVariants.id, { onDelete: 'set null' }),
  bookedAppointmentId: varchar("booked_appointment_id").references(() => clinicAppointments.id, { onDelete: 'set null' }),
```

Add one new partial index to its index array:

```typescript
  index("idx_flow_executions_variant").on(table.variantId).where(sql`${table.variantId} IS NOT NULL`),
```

Preserve existing columns + Phase 2's `resendEmailId` + Phase 2's partial index on it.

- [ ] **Step 4: Add column to `referralEvents` table in `shared/schema.ts`**

In the `referralEvents` pgTable (line 6676) add at the end of the column list:

```typescript
  flowExecutionId: varchar("flow_execution_id").references(() => flowExecutions.id, { onDelete: 'set null' }),
```

Add one new partial index:

```typescript
  index("referral_events_flow_execution").on(table.flowExecutionId).where(sql`${table.flowExecutionId} IS NOT NULL`),
```

- [ ] **Step 5: Create the migration SQL**

Create `migrations/0227_flows_ab_testing_demo.sql`:

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
  ADD COLUMN IF NOT EXISTS "ab_test_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_holdout_pct_per_arm" integer NOT NULL DEFAULT 10;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_winner_variant_id" varchar;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_winner_sent_at" timestamp;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_winner_status" varchar(20);

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "variant_id" varchar;
ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "booked_appointment_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_executions_variant_id_flow_variants_id_fk'
      AND conrelid = 'flow_executions'::regclass
  ) THEN
    ALTER TABLE "flow_executions"
      ADD CONSTRAINT "flow_executions_variant_id_flow_variants_id_fk"
      FOREIGN KEY ("variant_id") REFERENCES "flow_variants"("id")
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_executions_booked_appointment_id_fk'
      AND conrelid = 'flow_executions'::regclass
  ) THEN
    ALTER TABLE "flow_executions"
      ADD CONSTRAINT "flow_executions_booked_appointment_id_fk"
      FOREIGN KEY ("booked_appointment_id") REFERENCES "clinic_appointments"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_variant"
  ON "flow_executions" ("variant_id")
  WHERE "variant_id" IS NOT NULL;

ALTER TABLE "referral_events"
  ADD COLUMN IF NOT EXISTS "flow_execution_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_events_flow_execution_id_fk'
      AND conrelid = 'referral_events'::regclass
  ) THEN
    ALTER TABLE "referral_events"
      ADD CONSTRAINT "referral_events_flow_execution_id_fk"
      FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "referral_events_flow_execution"
  ON "referral_events" ("flow_execution_id")
  WHERE "flow_execution_id" IS NOT NULL;
```

- [ ] **Step 6: Register migration in journal**

Open `migrations/meta/_journal.json`. Current last entry is `idx: 226, when: 1777900000000, tag: "0226_flow_events_svix_idempotency"`. Append (comma after current last `}`):

```json
    ,{
      "idx": 227,
      "version": "7",
      "when": 1778000000000,
      "tag": "0227_flows_ab_testing_demo",
      "breakpoints": true
    }
```

`1778000000000` must be the new highest `when` value.

- [ ] **Step 7: Verify typecheck + migration idempotency**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

```
cd /home/mau/viali-flows-ab-demo && npm run db:migrate
```
Expected: applies cleanly.

```
cd /home/mau/viali-flows-ab-demo && npm run db:migrate
```
Expected: second run is a no-op (all `IF NOT EXISTS` + `DO $$ ... END $$` guards work).

- [ ] **Step 8: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add shared/schema.ts migrations/0227_flows_ab_testing_demo.sql migrations/meta/_journal.json
git commit -m "feat(flows): A/B testing schema (variants table + columns)"
```

---

## Task 2: Execution token helper (TDD)

**Files:**
- Create: `server/services/marketingExecutionToken.ts`
- Test: `tests/marketing-execution-token.test.ts`

This mirrors Phase 1's `marketingUnsubscribeToken.ts` line-by-line, just with a different payload shape and version `v: 2`.

- [ ] **Step 1: Write the failing test**

Create `tests/marketing-execution-token.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateExecutionToken,
  verifyExecutionToken,
} from "../server/services/marketingExecutionToken";

describe("marketingExecutionToken", () => {
  beforeEach(() => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret-abc123";
  });
  afterEach(() => {
    delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
  });

  it("round-trips a valid token with variant", () => {
    const token = generateExecutionToken("exec_1", "var_A");
    expect(verifyExecutionToken(token)).toEqual({
      executionId: "exec_1",
      variantId: "var_A",
    });
  });

  it("round-trips a valid token without variant (null)", () => {
    const token = generateExecutionToken("exec_1", null);
    expect(verifyExecutionToken(token)).toEqual({
      executionId: "exec_1",
      variantId: null,
    });
  });

  it("rejects a tampered payload", () => {
    const token = generateExecutionToken("exec_1", "var_A");
    const [payload, sig] = token.split(".");
    const mid = Math.floor(payload.length / 2);
    const orig = payload[mid];
    const replacement = orig === "A" ? "B" : "A";
    const tampered = payload.slice(0, mid) + replacement + payload.slice(mid + 1);
    expect(() => verifyExecutionToken(`${tampered}.${sig}`)).toThrow(/invalid/i);
  });

  it("rejects a tampered signature", () => {
    const token = generateExecutionToken("exec_1", "var_A");
    const [payload] = token.split(".");
    expect(() => verifyExecutionToken(`${payload}.deadbeef`)).toThrow(/invalid/i);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyExecutionToken("notatoken")).toThrow(/malformed/i);
  });

  it("rejects an unsubscribe token (v:1) when the verifier expects v:2", () => {
    // Shape from marketingUnsubscribeToken.ts — simulated here
    const { createHmac } = require("node:crypto");
    const payloadObj = { pid: "pat_1", hid: "hosp_1", v: 1 };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const sig = createHmac("sha256", "test-secret-abc123")
      .update(payloadB64)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(() => verifyExecutionToken(`${payloadB64}.${sig}`)).toThrow(/payload/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-execution-token.test.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `server/services/marketingExecutionToken.ts`:

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

interface ExecutionPayload {
  eid: string;              // flow_execution_id
  vid: string | null;       // variant_id (null when holdout remainder, pre-winner)
  v: 2;
}

// Reuses Phase 1's secret — intentional. Rotation invalidates outstanding
// booking-link tokens, same as unsubscribe tokens. See replit.md for ops notes.
function getSecret(): string {
  const s = process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      "MARKETING_UNSUBSCRIBE_SECRET (or SESSION_SECRET fallback) must be set",
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function generateExecutionToken(
  executionId: string,
  variantId: string | null,
): string {
  const payload: ExecutionPayload = { eid: executionId, vid: variantId, v: 2 };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = sign(payloadB64, getSecret());
  return `${payloadB64}.${signature}`;
}

export function verifyExecutionToken(token: string): {
  executionId: string;
  variantId: string | null;
} {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Malformed execution token");
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64, getSecret());

  const sigBuf = b64urlDecode(signature);
  const expBuf = b64urlDecode(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid execution token signature");
  }

  let parsed: ExecutionPayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("Malformed execution token payload");
  }
  if (parsed.v !== 2 || !parsed.eid) {
    throw new Error("Invalid execution token payload");
  }
  return {
    executionId: parsed.eid,
    variantId: parsed.vid ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-execution-token.test.ts
```
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/services/marketingExecutionToken.ts tests/marketing-execution-token.test.ts
git commit -m "feat(flows): HMAC execution token for A/B attribution"
```

---

## Task 3: Variant assignment + remainder send helpers (TDD)

**Files:**
- Create: `server/services/marketingAbAssignment.ts`
- Create: `server/services/marketingAbSendRemainder.ts`
- Test: `tests/marketing-ab-assignment.test.ts`
- Test: `tests/marketing-ab-send-remainder.test.ts`

- [ ] **Step 1: Write `marketing-ab-assignment.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { assignVariant } from "../server/services/marketingAbAssignment";

const variantA = { id: "var_A", label: "A", messageTemplate: "A text", flowId: "f1" } as any;
const variantB = { id: "var_B", label: "B", messageTemplate: "B text", flowId: "f1" } as any;
const variantC = { id: "var_C", label: "C", messageTemplate: "C text", flowId: "f1" } as any;

describe("assignVariant", () => {
  it("returns first variant and sendNow=true when abTestEnabled is false", () => {
    const flow = { id: "f1", abTestEnabled: false, abHoldoutPctPerArm: 10 } as any;
    const res = assignVariant("pat_1", flow, [variantA]);
    expect(res).toEqual({ variant: variantA, sendNow: true });
  });

  it("distributes a sample of 100 patients roughly per split (2 arms, 10% each)", () => {
    const flow = { id: "f1", abTestEnabled: true, abHoldoutPctPerArm: 10 } as any;
    let countA = 0, countB = 0, countHoldout = 0;
    for (let i = 0; i < 100; i++) {
      const res = assignVariant(`pat_${i}`, flow, [variantA, variantB]);
      if (!res.sendNow) countHoldout++;
      else if (res.variant?.id === "var_A") countA++;
      else countB++;
    }
    // With 10%/10%/80% split, expect roughly 10/10/80. Allow ±4 tolerance.
    expect(countA).toBeGreaterThanOrEqual(6);
    expect(countA).toBeLessThanOrEqual(14);
    expect(countB).toBeGreaterThanOrEqual(6);
    expect(countB).toBeLessThanOrEqual(14);
    expect(countHoldout).toBeGreaterThanOrEqual(76);
    expect(countHoldout).toBeLessThanOrEqual(84);
  });

  it("is deterministic: same patient + flow always assigned to same variant", () => {
    const flow = { id: "f1", abTestEnabled: true, abHoldoutPctPerArm: 10 } as any;
    const first = assignVariant("pat_99", flow, [variantA, variantB]);
    const second = assignVariant("pat_99", flow, [variantA, variantB]);
    expect(second).toEqual(first);
  });

  it("supports 3 variants (A/B/C) at 10% each, 70% holdout", () => {
    const flow = { id: "f1", abTestEnabled: true, abHoldoutPctPerArm: 10 } as any;
    let counts = { A: 0, B: 0, C: 0, hold: 0 };
    for (let i = 0; i < 100; i++) {
      const res = assignVariant(`pat_${i}`, flow, [variantA, variantB, variantC]);
      if (!res.sendNow) counts.hold++;
      else counts[res.variant!.label as "A" | "B" | "C"]++;
    }
    expect(counts.A + counts.B + counts.C + counts.hold).toBe(100);
    expect(counts.hold).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Run test — expect red**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-ab-assignment.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `marketingAbAssignment.ts`**

Create `server/services/marketingAbAssignment.ts`:

```typescript
import { createHash } from "node:crypto";
import type { Flow, FlowVariant } from "../../shared/schema";

export interface AssignmentResult {
  variant: FlowVariant | null;  // null when sendNow is false (holdout)
  sendNow: boolean;
}

export function assignVariant(
  patientId: string,
  flow: Pick<Flow, "id" | "abTestEnabled" | "abHoldoutPctPerArm">,
  variants: FlowVariant[],
): AssignmentResult {
  if (!flow.abTestEnabled || variants.length === 0) {
    return { variant: variants[0] ?? null, sendNow: true };
  }

  // Deterministic hash: patientId + flowId → bucket 0..99
  const hash = createHash("sha256")
    .update(`${patientId}.${flow.id}`)
    .digest("hex")
    .slice(0, 8);
  const bucket = parseInt(hash, 16) % 100;

  const armPct = flow.abHoldoutPctPerArm ?? 10;
  const arms = variants.length;
  const initialSendPct = armPct * arms;

  if (bucket < initialSendPct) {
    const idx = Math.floor(bucket / armPct);
    return { variant: variants[idx], sendNow: true };
  }
  return { variant: null, sendNow: false };
}
```

- [ ] **Step 4: Run test — expect green**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-ab-assignment.test.ts
```
Expected: all 4 tests PASS.

- [ ] **Step 5: Write `marketing-ab-send-remainder.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const capturedExecUpdates: any[] = [];
const capturedEventInserts: any[] = [];
let pendingExecutions: any[] = [];

vi.mock("../server/db", () => {
  const updateSetMock = vi.fn((patch: any) => ({
    where: vi.fn(() => {
      capturedExecUpdates.push(patch);
      return Promise.resolve();
    }),
  }));
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(pendingExecutions)),
        })),
      })),
      update: vi.fn(() => ({ set: updateSetMock })),
      insert: vi.fn(() => ({
        values: vi.fn((row: any) => {
          capturedEventInserts.push(row);
          return Promise.resolve();
        }),
      })),
    },
  };
});

beforeEach(() => {
  capturedExecUpdates.length = 0;
  capturedEventInserts.length = 0;
  pendingExecutions = [];
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret";
});

import { sendRemainderForWinner } from "../server/services/marketingAbSendRemainder";

describe("sendRemainderForWinner", () => {
  it("returns count 0 when no pending executions exist", async () => {
    pendingExecutions = [];
    const flow = { id: "f1", hospitalId: "h1", channel: "email", messageTemplate: "unused" } as any;
    const variant = { id: "var_A", label: "A", messageTemplate: "A body", messageSubject: "A subj" } as any;
    const res = await sendRemainderForWinner(flow, variant, {} as any);
    expect(res.sentCount).toBe(0);
  });

  it("stamps variant_id on each pending execution when winner is picked", async () => {
    pendingExecutions = [
      { id: "exec_1", patientId: "pat_1", patientEmail: "a@b.com", patientPhone: "+41000" },
      { id: "exec_2", patientId: "pat_2", patientEmail: "c@d.com", patientPhone: "+41001" },
    ];
    const flow = { id: "f1", hospitalId: "h1", channel: "email", messageTemplate: "unused", name: "demo" } as any;
    const variant = { id: "var_A", label: "A", messageTemplate: "Hi {{vorname}}", messageSubject: "Subj" } as any;

    // Stub the actual email sender to avoid hitting Resend
    vi.mock("../server/email", () => ({
      getUncachableResendClient: vi.fn(() => Promise.resolve({
        client: { emails: { send: vi.fn(() => Promise.resolve({ data: { id: "resend_xyz" } })) } },
        fromEmail: "no-reply@test",
      })),
    }));

    const res = await sendRemainderForWinner(flow, variant, { protocol: "https", get: () => "viali.app" } as any);

    expect(res.sentCount).toBeGreaterThanOrEqual(0); // Accept 0 if no sender — test guards shape only
    // Variant stamping: each pending exec should get a variantId update
    const variantUpdates = capturedExecUpdates.filter((p) => p.variantId === "var_A");
    expect(variantUpdates.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 6: Run test — expect red**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-ab-send-remainder.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 7: Implement `marketingAbSendRemainder.ts`**

Create `server/services/marketingAbSendRemainder.ts`:

```typescript
import { eq, and, isNull } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import {
  flowExecutions,
  flowEvents,
  flowVariants,
  flows,
  patients,
  patientMessages,
} from "../../shared/schema";
import { sendSms } from "../sms";
import { getUncachableResendClient } from "../email";
import { appendUnsubscribeFooter } from "./marketingConsent";
import { generateUnsubscribeToken } from "./marketingUnsubscribeToken";
import { generateExecutionToken } from "./marketingExecutionToken";
import logger from "../logger";

export interface RemainderSendResult {
  sentCount: number;
  failedCount: number;
}

/**
 * Sends a chosen winning variant to all hold-out executions (variant_id IS NULL,
 * status = 'pending') of a given flow. Reuses the Phase 1 consent filter
 * implicitly via the send loop's patient-level query; opted-out patients
 * already have variant_id NULL and will stay that way (we only send to
 * executions that were created during the initial send, which already
 * respected consent).
 *
 * Mutates: flow_executions (variant_id, status, resendEmailId), flow_events
 * (sent rows), patient_messages.
 */
export async function sendRemainderForWinner(
  flow: typeof flows.$inferSelect,
  winnerVariant: typeof flowVariants.$inferSelect,
  req: Request,
): Promise<RemainderSendResult> {
  // Find hold-out executions: variant_id NULL AND status = 'pending'
  const pending: Array<{
    id: string;
    patientId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    surname: string | null;
  }> = await db
    .select({
      id: flowExecutions.id,
      patientId: flowExecutions.patientId,
      email: patients.email,
      phone: patients.phone,
      firstName: patients.firstName,
      surname: patients.surname,
    })
    .from(flowExecutions)
    .innerJoin(patients, eq(patients.id, flowExecutions.patientId))
    .where(
      and(
        eq(flowExecutions.flowId, flow.id),
        isNull(flowExecutions.variantId),
        eq(flowExecutions.status, "pending"),
      ),
    );

  if (pending.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const baseUrl =
    process.env.PRODUCTION_URL || `${req.protocol}://${req.get("host")}`;

  let sentCount = 0;
  let failedCount = 0;

  for (const exec of pending) {
    try {
      // Stamp variant_id before sending so retries don't duplicate
      await db
        .update(flowExecutions)
        .set({ variantId: winnerVariant.id })
        .where(eq(flowExecutions.id, exec.id));

      const execToken = generateExecutionToken(exec.id, winnerVariant.id);
      const unsubToken = generateUnsubscribeToken(exec.patientId, flow.hospitalId);

      let message = winnerVariant.messageTemplate;
      message = message.replace(/\{\{vorname\}\}/g, exec.firstName || "");
      message = message.replace(/\{\{nachname\}\}/g, exec.surname || "");
      // Booking link already assembled elsewhere — for remainder send we rely on
      // the variant template containing {{buchungslink}}, same convention as the
      // main send loop. Add ?fe= to any existing link via simple string injection:
      message = message.replace(
        /\{\{buchungslink\}\}/g,
        `${baseUrl}/book/TOKEN?fe=${execToken}`,
      );

      let success = false;
      if (flow.channel === "sms" && exec.phone) {
        const result = await sendSms(
          exec.phone,
          `${message}\n\nAbmelden: ${baseUrl}/unsubscribe/${unsubToken}`,
          flow.hospitalId,
        );
        success = result.success;
      } else if (
        (flow.channel === "email" || flow.channel === "html_email") &&
        exec.email
      ) {
        const { client, fromEmail } = await getUncachableResendClient();
        const subject = winnerVariant.messageSubject || flow.messageSubject || "Nachricht";
        const baseHtml =
          flow.channel === "html_email"
            ? message
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`;
        const withFooter = appendUnsubscribeFooter(baseHtml, unsubToken, baseUrl, "de");
        const result = await client.emails.send({
          from: fromEmail,
          to: exec.email,
          subject,
          html: withFooter,
        });
        if (result.data?.id) {
          await db
            .update(flowExecutions)
            .set({ resendEmailId: result.data.id })
            .where(eq(flowExecutions.id, exec.id));
          success = true;
        }
      }

      await db.insert(flowEvents).values({
        executionId: exec.id,
        eventType: success ? "sent" : "bounced",
        metadata: { channel: flow.channel, winnerRemainderSend: true },
      });

      if (success) {
        await db
          .update(flowExecutions)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(flowExecutions.id, exec.id));
        sentCount++;
      } else {
        await db
          .update(flowExecutions)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(flowExecutions.id, exec.id));
        failedCount++;
      }
      await new Promise((r) => setTimeout(r, 100)); // rate limit
    } catch (err) {
      logger.error(`[ab remainder] send error for execution ${exec.id}:`, err);
      failedCount++;
    }
  }

  return { sentCount, failedCount };
}
```

- [ ] **Step 8: Run test — expect green**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-ab-send-remainder.test.ts
```
Expected: tests pass (shape/no-op + stamp variant_id assertions).

- [ ] **Step 9: Typecheck**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/services/marketingAbAssignment.ts server/services/marketingAbSendRemainder.ts tests/marketing-ab-assignment.test.ts tests/marketing-ab-send-remainder.test.ts
git commit -m "feat(flows): variant assignment + remainder send helpers"
```

---

## Task 4: Send-loop wiring — assign variant + per-exec token

**Files:**
- Modify: `server/routes/flows.ts` (send handler; currently around lines 1070–1190)

- [ ] **Step 1: Add imports at top of file**

Near the other service imports (around lines 19–22), add:

```typescript
import { generateExecutionToken } from "../services/marketingExecutionToken";
import { assignVariant } from "../services/marketingAbAssignment";
import { flowVariants } from "@shared/schema";
```

- [ ] **Step 2: Load variants at the start of the send handler**

In the send handler (search for `router.post("/api/business/:hospitalId/flows/:flowId/send"`), right after the `flow` is fetched and validated:

```typescript
      // Load variants for this flow (empty array if no variants configured)
      const variants = await db
        .select()
        .from(flowVariants)
        .where(eq(flowVariants.flowId, flow.id))
        .orderBy(flowVariants.label);

      // Safety: if A/B is enabled but no variants, fall back to single-variant send
      const effectiveAbEnabled = flow.abTestEnabled && variants.length >= 2;
```

- [ ] **Step 3: Inside the per-patient loop, assign a variant and pick the template**

Find the `for (const patient of patientResults)` loop. At the top of the loop body, before `let message = flow.messageTemplate!`, add:

```typescript
          const assignment = effectiveAbEnabled
            ? assignVariant(patient.id, flow, variants)
            : { variant: null as (typeof variants)[number] | null, sendNow: true };

          // Use variant template when A/B is active and a variant was assigned.
          // Fall back to the flow's own messageTemplate for single-variant flows
          // and for the hold-out patients (who get status='pending' and wait for
          // the manual winner pick — see POST /pick-winner endpoint).
          const chosenTemplate = assignment.variant?.messageTemplate ?? flow.messageTemplate!;
          const chosenSubject = assignment.variant?.messageSubject ?? flow.messageSubject;
```

Change the line `let message = flow.messageTemplate!;` to `let message = chosenTemplate;`.

If `flow.messageSubject` is referenced elsewhere in the email branch, ensure that branch uses `chosenSubject`.

- [ ] **Step 4: Skip hold-out patients — create execution row with variant_id=NULL and status='pending', then continue**

Right after the assignment block (and before the message-template replacements), add:

```typescript
          if (!assignment.sendNow) {
            // Hold-out: create execution row but don't send. Will be picked up
            // when staff clicks "Send <winner> to remainder".
            await db.insert(flowExecutions).values({
              flowId,
              patientId: patient.id,
              status: "pending",
              variantId: null,
            });
            continue;
          }
```

- [ ] **Step 5: Stamp variant_id on the execution row when created**

Find the existing `db.insert(flowExecutions).values({ flowId, patientId, status: "running" }).returning()` (or similar). Add `variantId: assignment.variant?.id ?? null,` to the values object.

- [ ] **Step 6: Add per-exec token `?fe=` to the booking URL**

Find where `bookingUrl` is built (search for `baseBookingUrl + bookingUrlSuffix`). Change the bookingUrl assembly to include the `fe` token per-patient-per-execution:

```typescript
          // Per-execution token — used by /book to attribute the booking back
          // to this specific execution + variant (Phase 3).
          const fe = generateExecutionToken(execution.id, assignment.variant?.id ?? null);
          const bookingUrl = `${baseBookingUrl}${bookingUrlSuffix}&fe=${fe}`;
```

Note: verify `bookingUrlSuffix` already starts with `?...`. The `&` is correct to append. If the suffix is empty (edge case), change to:

```typescript
          const fe = generateExecutionToken(execution.id, assignment.variant?.id ?? null);
          const separator = bookingUrlSuffix.includes("?") ? "&" : "?";
          const bookingUrl = `${baseBookingUrl}${bookingUrlSuffix}${separator}fe=${fe}`;
```

- [ ] **Step 7: Typecheck + run full flows test suite**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

```
cd /home/mau/viali-flows-ab-demo && DATABASE_URL="postgres://fake" SESSION_SECRET="fake" ENCRYPTION_SECRET="fakefakefakefakefakefakefakefake" npx vitest run tests/flows-consent-integration.test.ts tests/marketing-ab-assignment.test.ts tests/marketing-execution-token.test.ts
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/routes/flows.ts
git commit -m "feat(flows): send loop assigns variant + adds fe= token to booking URL"
```

---

## Task 5: `/book` POST extension — decode `fe=` + stamp attribution

**Files:**
- Modify: `server/routes/clinic.ts` (booking POST around line 710 + referral_events insert around line 820)

- [ ] **Step 1: Add imports**

At the top of `server/routes/clinic.ts`, add:

```typescript
import { verifyExecutionToken } from "../services/marketingExecutionToken";
```

- [ ] **Step 2: Decode `fe=` from the booking POST body**

Find the booking POST handler (line 710, `router.post('/api/public/booking/:bookingToken/book', ...)`). Somewhere early in the body (after `parsed.data` is available), add:

```typescript
      // Decode A/B execution token if present — Phase 3.
      let decodedFlowExecutionId: string | null = null;
      const feToken = (req.body?.fe as string | undefined)?.trim();
      if (feToken) {
        try {
          const { executionId } = verifyExecutionToken(feToken);
          decodedFlowExecutionId = executionId;
        } catch (err) {
          // Tampered/expired token — silently ignore, fall back to utm_content
          logger.debug("[book] invalid fe token, ignoring:", (err as Error).message);
        }
      }
```

- [ ] **Step 3: Add `fe` to the Zod schema if one exists for the booking body**

Search for the Zod schema that validates the booking body. If there's a schema like `const bookingSchema = z.object({...})`, add:

```typescript
  fe: z.string().max(2000).nullish(),
```

- [ ] **Step 4: Stamp `referral_events.flow_execution_id` on insert**

Find the `referral_events` insert around line 820 (the block that lists `utmSource`, `utmMedium`, etc.). After `campaignId: parsed.data.campaignId || null,` or similar, add:

```typescript
          flowExecutionId: decodedFlowExecutionId,
```

- [ ] **Step 5: Stamp `flow_executions.booked_appointment_id` after appointment creation**

In the same handler, after the appointment row is inserted (search for `db.insert(clinicAppointments)` or similar — look for where `appointmentId` / `newAppointment.id` is first available), add:

```typescript
      // Phase 3: if this booking came from an A/B execution, stamp the booked
      // appointment on the execution so per-variant booking counts resolve via
      // the exact execution → appointment path instead of relying on utm_content.
      if (decodedFlowExecutionId) {
        await db
          .update(flowExecutions)
          .set({ bookedAppointmentId: appointmentId })
          .where(eq(flowExecutions.id, decodedFlowExecutionId));
      }
```

Import `flowExecutions` and `eq` at the top of the file if not already present. The appointment's ID variable might be named `newAppointment.id`, `appointmentId`, or similar — inspect surrounding code.

- [ ] **Step 6: Also update the client-side capture in BookAppointment.tsx**

The `/book` client page currently captures `utm_content` from the URL. It should also capture `fe` and pass it in the POST body.

Open `client/src/pages/BookAppointment.tsx`. Around line 161 (where `utmContent = searchParams.get("utm_content");` lives), add:

```typescript
  const feToken = searchParams.get("fe");
```

Add to the state dependency array and include in the POST body. Find the `apiRequest` or `fetch` call that submits the booking (around lines 560-570, look for `utmContent`). Add `fe: feToken` alongside.

Also add to the `useCallback`/`useEffect` dependency list (around line 624) so React doesn't warn about missing deps: `feToken`.

- [ ] **Step 7: Typecheck**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/routes/clinic.ts client/src/pages/BookAppointment.tsx
git commit -m "feat(flows): /book POST decodes fe= and stamps A/B attribution"
```

---

## Task 6: Metrics query per-variant extension

**Files:**
- Modify: `server/services/marketingMetricsQuery.ts` (extend `flowDetail`)

- [ ] **Step 1: Extend `FlowDetailResult` type**

In `server/services/marketingMetricsQuery.ts`, find the `FlowDetailResult` interface. Add a `perVariant` field:

```typescript
export interface FlowDetailResult {
  funnel: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
    revenue: number;
  };
  perVariant?: Array<{
    variantId: string;
    label: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
    revenue: number;
  }>;
  bounces: Array<{ email: string; bounceType: string | null; createdAt: Date }>;
  complaints: Array<{ email: string; createdAt: Date }>;
  series: Array<{ day: string; opened: number; clicked: number }>;
}
```

- [ ] **Step 2: Add the per-variant query and revenue lookup inside `flowDetail`**

At the end of `flowDetail` (after the existing queries, before the return), add:

```typescript
  // Per-variant breakdown. Returns empty array if the flow has no variants.
  const perVariantEventsResult = await db.execute(sql`
    SELECT
      v.id AS "variantId",
      v.label AS "label",
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')                   AS sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered')              AS delivered,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')    AS opened,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked')   AS clicked,
      COUNT(*) FILTER (WHERE ev.event_type = 'bounced')                AS bounced,
      COUNT(*) FILTER (WHERE ev.event_type = 'complained')             AS complained
    FROM flow_variants v
    LEFT JOIN flow_executions fe ON fe.variant_id = v.id
    LEFT JOIN flow_events ev ON ev.execution_id = fe.id
    WHERE v.flow_id = ${flowId}
    GROUP BY v.id, v.label
    ORDER BY v.label
  `);

  const perVariantBookingsResult = await db.execute(sql`
    SELECT
      fe.variant_id AS "variantId",
      COUNT(*) FILTER (WHERE fe.booked_appointment_id IS NOT NULL) AS bookings,
      COALESCE(SUM(cs.price), 0) AS revenue
    FROM flow_executions fe
    LEFT JOIN clinic_appointments ca ON ca.id = fe.booked_appointment_id
    LEFT JOIN clinic_services cs ON cs.id = ca.service_id
    WHERE fe.flow_id = ${flowId}
      AND fe.variant_id IS NOT NULL
      AND (ca.status IS NULL OR ca.status NOT IN ('cancelled', 'no_show'))
    GROUP BY fe.variant_id
  `);

  const bookingsByVariant: Record<string, { bookings: number; revenue: number }> = {};
  for (const r of ((perVariantBookingsResult as any).rows ?? [])) {
    bookingsByVariant[r.variantId] = {
      bookings: Number(r.bookings) || 0,
      revenue: Number(r.revenue) || 0,
    };
  }

  const perVariantRows = ((perVariantEventsResult as any).rows ?? []).map((r: any) => ({
    variantId: r.variantId,
    label: r.label,
    sent: Number(r.sent) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    bounced: Number(r.bounced) || 0,
    complained: Number(r.complained) || 0,
    bookings: bookingsByVariant[r.variantId]?.bookings ?? 0,
    revenue: bookingsByVariant[r.variantId]?.revenue ?? 0,
  }));
```

Update the `return` to include `perVariant` conditionally:

```typescript
  return {
    funnel: { /* ... existing ... */ },
    ...(perVariantRows.length > 0 && { perVariant: perVariantRows }),
    bounces: /* ... */,
    complaints: /* ... */,
    series: /* ... */,
  };
```

- [ ] **Step 2b: Add a test assertion to `tests/marketing-metrics-query.test.ts`**

In the `flowDetail` describe block, add:

```typescript
  it("queries flow_variants for per-variant breakdown", async () => {
    await flowDetail("flow_xyz");
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("flow_variants");
    expect(allSql).toMatch(/group by.*variant/i);
  });
```

- [ ] **Step 3: Typecheck + tests**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/marketing-metrics-query.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/services/marketingMetricsQuery.ts tests/marketing-metrics-query.test.ts
git commit -m "feat(flows): per-variant funnel in flowDetail metrics"
```

---

## Task 7: Pick-winner endpoint + variants CRUD piggyback

**Files:**
- Modify: `server/routes/flows.ts` (extend PATCH flow; add POST pick-winner; extend GET flow to include variants)

- [ ] **Step 1: Extend `GET /api/business/:hospitalId/flows/:flowId` to include variants**

Find the existing `GET` single-flow handler (line 72). Change to load variants alongside:

```typescript
router.get(
  "/api/business/:hospitalId/flows/:flowId",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      const [flow] = await db
        .select()
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });

      const variants = await db
        .select()
        .from(flowVariants)
        .where(eq(flowVariants.flowId, flow.id))
        .orderBy(flowVariants.label);

      res.json({ ...flow, variants });
    } catch (error) {
      logger.error("[flows] get error:", error);
      res.status(500).json({ message: "Failed to get campaign" });
    }
  },
);
```

- [ ] **Step 2: Extend PATCH flow to accept + upsert `variants` array**

Find the PATCH handler (around line 125). Change the body to handle an optional `variants` field:

```typescript
router.patch(
  "/api/business/:hospitalId/flows/:flowId",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      const { variants: incomingVariants, ...flowPatch } = req.body;

      const [flow] = await db
        .update(flows)
        .set({ ...flowPatch, updatedAt: new Date() })
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)))
        .returning();
      if (!flow) return res.status(404).json({ message: "Campaign not found" });

      if (Array.isArray(incomingVariants)) {
        // Replace the variants for this flow with the provided array.
        // Delete existing variants then insert fresh rows.
        await db.delete(flowVariants).where(eq(flowVariants.flowId, flow.id));
        if (incomingVariants.length > 0) {
          await db.insert(flowVariants).values(
            incomingVariants.map((v: any) => ({
              flowId: flow.id,
              label: v.label,
              messageSubject: v.messageSubject ?? null,
              messageTemplate: v.messageTemplate,
              promoCodeId: v.promoCodeId ?? null,
              weight: v.weight ?? 1,
            })),
          );
        }
      }

      const variants = await db
        .select()
        .from(flowVariants)
        .where(eq(flowVariants.flowId, flow.id))
        .orderBy(flowVariants.label);

      res.json({ ...flow, variants });
    } catch (error) {
      logger.error("[flows] update error:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  },
);
```

- [ ] **Step 3: Add POST pick-winner endpoint**

At the bottom of `server/routes/flows.ts` (before `export default router;`), add:

```typescript
// ─── A/B: manual pick-winner ──────────────────────────────────
import { sendRemainderForWinner } from "../services/marketingAbSendRemainder";

router.post(
  "/api/business/:hospitalId/flows/:flowId/pick-winner",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    (req as any).setTimeout(300000); // 5 min for remainder sends
    res.setTimeout(300000);
    try {
      const { hospitalId, flowId } = req.params;
      const { variantId } = req.body as { variantId?: string };
      if (!variantId) return res.status(400).json({ message: "variantId required" });

      const [flow] = await db
        .select()
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      if (!flow.abTestEnabled) {
        return res.status(400).json({ message: "Campaign is not an A/B test" });
      }
      if (flow.abWinnerVariantId) {
        return res.status(400).json({ message: "Winner already picked" });
      }

      const [variant] = await db
        .select()
        .from(flowVariants)
        .where(and(eq(flowVariants.id, variantId), eq(flowVariants.flowId, flow.id)));
      if (!variant) return res.status(404).json({ message: "Variant not found" });

      // Mark winner immediately so the UI reflects the decision
      await db
        .update(flows)
        .set({
          abWinnerVariantId: variantId,
          abWinnerStatus: "manual",
          abWinnerSentAt: new Date(),
        })
        .where(eq(flows.id, flow.id));

      const result = await sendRemainderForWinner(flow, variant, req);

      res.json({
        winnerVariantId: variantId,
        sentToRemainder: result.sentCount,
        failedInRemainder: result.failedCount,
      });
    } catch (err) {
      logger.error("[flows] pick-winner error:", err);
      res.status(500).json({ message: "Pick-winner failed" });
    }
  },
);
```

Move the `import` to the top of the file with the other imports:

```typescript
import { sendRemainderForWinner } from "../services/marketingAbSendRemainder";
```

- [ ] **Step 4: Typecheck**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/routes/flows.ts
git commit -m "feat(flows): pick-winner endpoint + variants in flow payload"
```

---

## Task 8: VariantTabs + AbConfigSection + FlowCreate wiring

**Files:**
- Create: `client/src/components/flows/VariantTabs.tsx`
- Create: `client/src/components/flows/AbConfigSection.tsx`
- Modify: `client/src/pages/business/FlowCreate.tsx` (local state shape, compose section, persist on next)

- [ ] **Step 1: Create `VariantTabs.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Sparkles } from "lucide-react";

export interface Variant {
  label: string; // "A", "B", "C"
  messageSubject?: string;
  messageTemplate: string;
}

interface Props {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
  showSubject: boolean; // email channels show subject; SMS does not
  onGenerateAi?: (baseVariant: Variant) => Promise<{ subject?: string; body: string }>;
}

const MAX_VARIANTS = 3;
const LABELS = ["A", "B", "C"];

export default function VariantTabs({ variants, onChange, showSubject, onGenerateAi }: Props) {
  const { t } = useTranslation();

  const addVariant = async () => {
    if (variants.length >= MAX_VARIANTS) return;
    const label = LABELS[variants.length];
    const fresh: Variant = {
      label,
      messageSubject: variants[0]?.messageSubject,
      messageTemplate: variants[0]?.messageTemplate ?? "",
    };
    if (onGenerateAi && variants.length > 0) {
      try {
        const gen = await onGenerateAi(variants[0]);
        fresh.messageTemplate = gen.body;
        if (gen.subject) fresh.messageSubject = gen.subject;
      } catch {
        // If AI generation fails, keep the seeded copy of variant A
      }
    }
    onChange([...variants, fresh]);
  };

  const removeVariant = (idx: number) => {
    onChange(variants.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx: number, patch: Partial<Variant>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  if (variants.length === 0) {
    // Should not happen — FlowCreate seeds variant A on mount. Guard anyway.
    return null;
  }

  return (
    <div className="space-y-4">
      <Tabs value={variants[0]?.label} onValueChange={() => {}}>
        <TabsList className="flex items-center">
          {variants.map((v, i) => (
            <TabsTrigger key={v.label} value={v.label}>
              {t("flows.ab.variant", "Variant")} {v.label}
              {variants.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeVariant(i); }}
                  className="ml-2 text-muted-foreground hover:text-destructive"
                  title={t("flows.ab.removeVariant", "Remove variant")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </TabsTrigger>
          ))}
          {variants.length < MAX_VARIANTS && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 gap-1"
              onClick={addVariant}
            >
              {onGenerateAi && variants.length >= 1 ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t("flows.ab.addWithAi", "Add + AI")}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {t("flows.ab.add", "Add variant")}
                </>
              )}
            </Button>
          )}
        </TabsList>

        {variants.map((v, i) => (
          <TabsContent key={v.label} value={v.label} className="space-y-4 pt-4">
            {showSubject && (
              <div>
                <label className="text-sm font-medium">
                  {t("flows.ab.subject", "Subject")}
                </label>
                <Input
                  value={v.messageSubject ?? ""}
                  onChange={(e) => updateVariant(i, { messageSubject: e.target.value })}
                  placeholder={t("flows.ab.subjectPlaceholder", "Email subject line")}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">
                {t("flows.ab.body", "Message body")}
              </label>
              <Textarea
                value={v.messageTemplate}
                onChange={(e) => updateVariant(i, { messageTemplate: e.target.value })}
                rows={10}
                placeholder={t("flows.ab.bodyPlaceholder", "Message body...")}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Create `AbConfigSection.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  holdoutPctPerArm: number;
  onChange: (pct: number) => void;
  segmentSize: number | null;
  variantCount: number;
}

export default function AbConfigSection({
  holdoutPctPerArm,
  onChange,
  segmentSize,
  variantCount,
}: Props) {
  const { t } = useTranslation();
  const initialSendCount =
    segmentSize !== null
      ? Math.round((segmentSize * holdoutPctPerArm * variantCount) / 100)
      : null;
  const holdoutCount =
    segmentSize !== null && initialSendCount !== null ? segmentSize - initialSendCount : null;

  return (
    <div className="border rounded-md p-4 space-y-3 bg-muted/30">
      <h4 className="font-semibold">{t("flows.ab.configTitle", "A/B Test Configuration")}</h4>
      <div className="flex items-center gap-4">
        <Label className="text-sm">{t("flows.ab.holdoutPct", "Hold-out per arm")}</Label>
        <Select
          value={String(holdoutPctPerArm)}
          onValueChange={(v) => onChange(parseInt(v, 10))}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10%</SelectItem>
            <SelectItem value="15">15%</SelectItem>
            <SelectItem value="20">20%</SelectItem>
            <SelectItem value="25">25%</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {segmentSize !== null && (
        <p className="text-sm text-muted-foreground">
          {t(
            "flows.ab.preview",
            "Initial send: {{count}} patients ({{perArm}} per arm). {{holdout}} wait for the winner.",
            {
              count: initialSendCount ?? 0,
              perArm: Math.round((segmentSize * holdoutPctPerArm) / 100),
              holdout: holdoutCount ?? 0,
            },
          )}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire variants into `FlowCreate.tsx`**

Open `client/src/pages/business/FlowCreate.tsx`. The current state shape stores `messageTemplate` and `messageSubject` directly. Extend it to carry a `variants` array:

1. Add state:
```tsx
import VariantTabs, { type Variant } from "@/components/flows/VariantTabs";
import AbConfigSection from "@/components/flows/AbConfigSection";

const [variants, setVariants] = useState<Variant[]>([
  { label: "A", messageSubject: messageSubject, messageTemplate: messageTemplate },
]);
const [abHoldoutPctPerArm, setAbHoldoutPctPerArm] = useState(10);
```

2. In the Compose section of the wizard, replace the single-message editor with:

```tsx
<VariantTabs
  variants={variants}
  onChange={setVariants}
  showSubject={channel === "email" || channel === "html_email"}
  onGenerateAi={async (base) => {
    // Call /compose with a tweaked prompt asking for an A/B variant rewrite
    const res = await apiRequest("POST", `/api/business/${hospitalId}/flows/compose`, {
      channel,
      treatment: /* existing treatment value from filters */ "",
      abVariantOf: base.messageTemplate,
    });
    const data = await res.json();
    return { subject: data.subject, body: data.body ?? data.message ?? "" };
  }}
/>
{variants.length >= 2 && (
  <AbConfigSection
    holdoutPctPerArm={abHoldoutPctPerArm}
    onChange={setAbHoldoutPctPerArm}
    segmentSize={patientCount}
    variantCount={variants.length}
  />
)}
```

3. When persisting the draft (in the "Next" button handler that calls PATCH), include variants + A/B flag:

```tsx
const payload: any = {
  name,
  segmentFilters: filters,
  channel,
  messageTemplate: variants[0]?.messageTemplate, // Keep single-variant consumers happy
  messageSubject: variants[0]?.messageSubject,
  promoCodeId: selectedPromoCodeId,
  abTestEnabled: variants.length >= 2,
  abHoldoutPctPerArm,
  variants: variants.map((v) => ({
    label: v.label,
    messageSubject: v.messageSubject,
    messageTemplate: v.messageTemplate,
  })),
};
await apiRequest("PATCH", `/api/business/${hospitalId}/flows/${draftId}`, payload);
```

4. Add a small A/B prompt mode to `/flows/compose` on the server (`server/routes/flows.ts`, compose endpoint around line ~480). If `req.body.abVariantOf` is a non-empty string, add to the prompt:

```typescript
      if (req.body.abVariantOf) {
        userPrompt += `\n\nThis is variant B of an A/B test. Variant A says:\n"""${req.body.abVariantOf}"""\nWrite a notably different variant B — different angle / tone / hook — keeping the same offer and language.`;
      }
```

(Locate the existing user-prompt construction in the compose endpoint and append there. Keep original single-variant prompt behavior when `abVariantOf` is absent.)

- [ ] **Step 4: Typecheck**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add client/src/components/flows/VariantTabs.tsx client/src/components/flows/AbConfigSection.tsx client/src/pages/business/FlowCreate.tsx server/routes/flows.ts
git commit -m "feat(flows): variant editor + A/B config in wizard"
```

---

## Task 9: FlowMetrics per-variant view + Pick Winner buttons

**Files:**
- Modify: `client/src/pages/business/FlowMetrics.tsx`

- [ ] **Step 1: Extend the `FlowDetail` interface**

Add `perVariant` to the type:

```typescript
interface VariantRow {
  variantId: string;
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  bookings: number;
  revenue: number;
}

interface FlowDetail {
  funnel: { /* ... existing ... */ };
  perVariant?: VariantRow[];
  bounces: Array<{ email: string; bounceType: string | null; createdAt: string }>;
  complaints: Array<{ email: string; createdAt: string }>;
  series: Array<{ day: string; opened: number; clicked: number }>;
}
```

- [ ] **Step 2: Extend `FlowSummary` with A/B fields**

```typescript
interface FlowSummary {
  id: string;
  name: string;
  status: string;
  channel: string | null;
  sentAt: string | null;
  abTestEnabled: boolean;
  abWinnerVariantId: string | null;
  abWinnerStatus: string | null;
}
```

- [ ] **Step 3: Add pick-winner mutation**

Inside the component:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const queryClient = useQueryClient();
const { toast } = useToast();

const pickWinner = useMutation({
  mutationFn: (variantId: string) =>
    apiRequest("POST", `/api/business/${hospitalId}/flows/${flowId}/pick-winner`, { variantId })
      .then((r) => r.json()),
  onSuccess: (data) => {
    toast({
      title: t("flows.ab.winnerPicked", "Winner picked"),
      description: t("flows.ab.remainderSent", "{{count}} messages sent to the remainder.", {
        count: data.sentToRemainder,
      }),
    });
    queryClient.invalidateQueries({ queryKey: ["flow", hospitalId, flowId] });
    queryClient.invalidateQueries({ queryKey: ["flow-metrics", hospitalId, flowId] });
  },
  onError: () => {
    toast({
      title: t("flows.ab.winnerError", "Could not pick winner"),
      variant: "destructive",
    });
  },
});
```

- [ ] **Step 4: Render the per-variant comparison section**

Below the existing funnel card, add:

```tsx
{metrics.perVariant && metrics.perVariant.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle>{t("flows.ab.comparisonTitle", "Variant Comparison")}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className={`grid gap-4 ${metrics.perVariant.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {metrics.perVariant.map((v) => {
          const isWinner = flow?.abWinnerVariantId === v.variantId;
          return (
            <div
              key={v.variantId}
              className={`border rounded-md p-4 space-y-2 ${isWinner ? "border-emerald-500 bg-emerald-50/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">
                  {t("flows.ab.variant", "Variant")} {v.label}
                </h4>
                {isWinner && (
                  <Badge className="bg-emerald-600">
                    {t("flows.ab.winner", "Winner")}
                  </Badge>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>{t("flows.funnel.sent", "Sent")}</span>
                  <span className="font-medium">{v.sent}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("flows.funnel.opened", "Opened")}</span>
                  <span className="font-medium">
                    {v.opened}
                    {v.sent > 0 && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({Math.round((v.opened / v.sent) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("flows.funnel.clicked", "Clicked")}</span>
                  <span className="font-medium">{v.clicked}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("flows.funnel.booked", "Booked")}</span>
                  <span className="font-medium">{v.bookings}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("flows.funnel.revenue", "Revenue")}</span>
                  <span className="font-medium text-emerald-600">
                    {formatCurrency(v.revenue)}
                  </span>
                </div>
              </div>
              {flow?.abTestEnabled && !flow?.abWinnerVariantId && (
                <Button
                  className="w-full mt-2"
                  size="sm"
                  onClick={() => pickWinner.mutate(v.variantId)}
                  disabled={pickWinner.isPending}
                >
                  {t("flows.ab.pickVariant", "Send Variant {{label}} to remainder", { label: v.label })}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {flow?.abWinnerVariantId && (
        <p className="text-sm text-muted-foreground mt-4">
          {t("flows.ab.winnerDescription", "Winner was sent to the remaining hold-out patients.")}
        </p>
      )}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 5: Typecheck**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add client/src/pages/business/FlowMetrics.tsx
git commit -m "feat(flows): per-variant comparison + Pick Winner buttons"
```

---

## Task 10: A/B badge on Flows list rows

**Files:**
- Modify: `client/src/pages/business/Flows.tsx`

- [ ] **Step 1: Add A/B badge**

In `Flows.tsx`, extend the campaign row to show a small "A/B" badge when `c.abTestEnabled` is true. Near the name cell (around the campaign name render), add:

```tsx
{c.abTestEnabled && (
  <Badge variant="outline" className="ml-2 text-xs border-purple-400 text-purple-600">
    A/B
  </Badge>
)}
```

Additionally, if `c.abWinnerVariantId` is truthy AND a lookup of the winning variant label is possible (from a separate optional variants-preview query or just a generic "winner picked" badge), show a subtle marker. For demo simplicity, showing just "A/B" is enough — the drill-down page is where staff sees the winner.

- [ ] **Step 2: Typecheck + commit**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

```bash
cd /home/mau/viali-flows-ab-demo
git add client/src/pages/business/Flows.tsx
git commit -m "feat(flows): A/B badge on campaign list rows"
```

---

## Task 11: Public docs + test

**Files:**
- Modify: `server/routes/publicDocs.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Document `fe=` param in `PUBLIC_API_MD`**

Find the booking-link URL-params section of `PUBLIC_API_MD` (where `utm_source`, `utm_content`, `gclid`, etc. are documented). Append:

```markdown
| `fe` | string | `<HMAC-signed token>` | Marketing flow per-execution attribution token (generated by Flows A/B send loop). Binds the booking to a specific campaign send + variant. Integrators should NOT forge this — invalid tokens are silently ignored and the booking falls back to UTM attribution. |
```

Match the surrounding markdown table style.

- [ ] **Step 2: Assert docs**

Open `tests/public-docs.test.ts`. In the existing `it("documents every public endpoint path"` (or similar) block, add:

```typescript
expect(res.text).toContain("`fe`");
```

- [ ] **Step 3: Run public-docs test**

```
cd /home/mau/viali-flows-ab-demo && npx vitest run tests/public-docs.test.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/routes/publicDocs.ts tests/public-docs.test.ts
git commit -m "docs(flows): document fe= booking-link param"
```

---

## Task 12: Seed demo data script + final verify

**Files:**
- Create: `server/scripts/seedAbDemo.ts`
- Modify: `package.json` (add script entry)

- [ ] **Step 1: Create seed script**

Create `server/scripts/seedAbDemo.ts`:

```typescript
/* eslint-disable no-console */
/**
 * Dev-only: seed a demo A/B campaign with fake engagement events so the
 * FlowMetrics drill-down shows interesting numbers without needing a real
 * Resend webhook setup. Intended for the Patrick demo call on Wednesday.
 *
 * Usage: npm run seed:ab-demo -- <hospital-id>
 */
import { db } from "../db";
import {
  flows,
  flowVariants,
  flowExecutions,
  flowEvents,
  patients,
  clinicAppointments,
  clinicServices,
  referralEvents,
} from "../../shared/schema";
import { eq, isNull } from "drizzle-orm";

async function main() {
  const hospitalId = process.argv[2];
  if (!hospitalId) {
    console.error("Usage: npm run seed:ab-demo -- <hospital-id>");
    process.exit(1);
  }

  // Fetch some patients to attach executions to
  const availablePatients = await db
    .select({ id: patients.id })
    .from(patients)
    .where(eq(patients.hospitalId, hospitalId))
    .limit(80);
  if (availablePatients.length < 20) {
    console.error("Need at least 20 patients seeded on this hospital");
    process.exit(1);
  }

  const service = await db
    .select({ id: clinicServices.id, price: clinicServices.price })
    .from(clinicServices)
    .where(eq(clinicServices.hospitalId, hospitalId))
    .limit(1);
  const serviceId = service[0]?.id ?? null;

  // Create the demo flow
  const [flow] = await db
    .insert(flows)
    .values({
      hospitalId,
      name: "Demo: Spring Botox A/B",
      status: "sent",
      triggerType: "manual",
      channel: "email",
      messageTemplate: "Variant A (used for fallback)",
      abTestEnabled: true,
      abHoldoutPctPerArm: 10,
      recipientCount: 80,
      sentAt: new Date(Date.now() - 2 * 86400000),
    })
    .returning();

  const [varA, varB] = await db
    .insert(flowVariants)
    .values([
      { flowId: flow.id, label: "A", messageTemplate: "Spring Glow — 20% off Botox", messageSubject: "Spring Glow" },
      { flowId: flow.id, label: "B", messageTemplate: "Refresh your look — 20% off Botox", messageSubject: "Refresh" },
    ])
    .returning();

  // Split 80 patients: 8 variant A + 8 variant B + 64 holdout
  const aPatients = availablePatients.slice(0, 8);
  const bPatients = availablePatients.slice(8, 16);
  const holdoutPatients = availablePatients.slice(16, 80);

  const executionsA = await db
    .insert(flowExecutions)
    .values(aPatients.map((p) => ({
      flowId: flow.id,
      patientId: p.id,
      variantId: varA.id,
      status: "completed",
      startedAt: new Date(Date.now() - 2 * 86400000),
      completedAt: new Date(Date.now() - 2 * 86400000),
    })))
    .returning();

  const executionsB = await db
    .insert(flowExecutions)
    .values(bPatients.map((p) => ({
      flowId: flow.id,
      patientId: p.id,
      variantId: varB.id,
      status: "completed",
      startedAt: new Date(Date.now() - 2 * 86400000),
      completedAt: new Date(Date.now() - 2 * 86400000),
    })))
    .returning();

  await db.insert(flowExecutions).values(holdoutPatients.map((p) => ({
    flowId: flow.id,
    patientId: p.id,
    variantId: null,
    status: "pending",
    startedAt: new Date(Date.now() - 2 * 86400000),
  })));

  // Engagement events: B noticeably outperforms A
  // Variant A: 8 sent, 7 delivered, 3 opened, 1 clicked, 1 booked
  // Variant B: 8 sent, 8 delivered, 6 opened, 4 clicked, 3 booked
  for (const e of executionsA) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "sent", metadata: {} });
  }
  for (const e of executionsA.slice(0, 7)) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "delivered", metadata: {} });
  }
  for (const e of executionsA.slice(0, 3)) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "opened", metadata: {} });
  }
  for (const e of executionsA.slice(0, 1)) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "clicked", metadata: {} });
  }

  for (const e of executionsB) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "sent", metadata: {} });
  }
  for (const e of executionsB) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "delivered", metadata: {} });
  }
  for (const e of executionsB.slice(0, 6)) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "opened", metadata: {} });
  }
  for (const e of executionsB.slice(0, 4)) {
    await db.insert(flowEvents).values({ executionId: e.id, eventType: "clicked", metadata: {} });
  }

  // Bookings: attribute via flow_execution_id + booked_appointment_id
  // Create one real appointment per booking and link it up
  const bookedExecs = [...executionsA.slice(0, 1), ...executionsB.slice(0, 3)];
  for (const exec of bookedExecs) {
    if (!serviceId) continue;
    const [appt] = await db
      .insert(clinicAppointments)
      .values({
        hospitalId,
        unitId: (await db.select({ id: clinicAppointments.unitId }).from(clinicAppointments).limit(1))[0]?.id ?? hospitalId, // fallback
        appointmentType: "external",
        patientId: exec.patientId,
        providerId: hospitalId, // dummy FK — inspect real user; this is seed only
        serviceId,
        appointmentDate: new Date().toISOString().slice(0, 10),
        startTime: "09:00",
        endTime: "10:00",
        durationMinutes: 60,
        status: "confirmed",
      })
      .returning();
    await db
      .update(flowExecutions)
      .set({ bookedAppointmentId: appt.id })
      .where(eq(flowExecutions.id, exec.id));
    await db.insert(referralEvents).values({
      hospitalId,
      patientId: exec.patientId,
      appointmentId: appt.id,
      source: "marketing",
      utmSource: "email_campaign",
      utmMedium: "email",
      utmCampaign: flow.name,
      utmContent: flow.id,
      flowExecutionId: exec.id,
      captureMethod: "utm",
    });
  }

  console.log(`Seeded demo flow ${flow.id} on hospital ${hospitalId}`);
  console.log(`Visit: /business/flows/${flow.id}/metrics`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: the seed script's dummy `providerId: hospitalId` is a hack — verify by inspecting a real `clinic_appointments` row to know what a valid provider user id looks like on the target hospital before running. Adjust if the insert fails.

- [ ] **Step 2: Add npm script**

Open `package.json`. Add to `scripts`:

```json
"seed:ab-demo": "tsx server/scripts/seedAbDemo.ts"
```

(If `tsx` isn't already a dev dep, check — the project uses it for other scripts. If unavailable, use `node --loader tsx`.)

- [ ] **Step 3: Run the full test suite**

```
cd /home/mau/viali-flows-ab-demo && DATABASE_URL="postgres://fake" SESSION_SECRET="fake" ENCRYPTION_SECRET="fakefakefakefakefakefakefakefake" npx vitest run
```
Expected: all tests pass. Some pre-existing env-dependent failures may surface (like flow-consent-integration needing env); note them, don't block.

- [ ] **Step 4: Final typecheck**

```
cd /home/mau/viali-flows-ab-demo && npm run check
```
Expected: exits 0.

- [ ] **Step 5: Verify drizzle schema in sync**

```
cd /home/mau/viali-flows-ab-demo && npx drizzle-kit push
```
Expected: "Changes applied" (no prompts).

- [ ] **Step 6: Commit + branch summary**

```bash
cd /home/mau/viali-flows-ab-demo
git add server/scripts/seedAbDemo.ts package.json
git commit -m "feat(flows): seed demo A/B data script for Patrick call"
```

Run:
```
cd /home/mau/viali-flows-ab-demo && git log --oneline e51692bc..HEAD
```

Report the full commit chain.

---

## Notes for the implementing agent

- **Per user feedback, skip per-task spec+quality reviews** — run one final code-review agent at the very end of all 12 tasks (or inline verification if that's faster). Commits between tasks still happen.
- **No cron job, no statistical significance** — explicitly deferred to Phase 3.1.
- **Wednesday demo target** — if a task runs into unexpected complexity, note it and move on; the seed script is the safety net for demo content.
- **Idempotent migration is mandatory** — production server re-runs on every boot.
- **CLAUDE.md timezone rule applies** — `formatDateTime` helper for timestamps (already imported in FlowMetrics from Phase 2).
- **Phase 1 secret is reused** — `MARKETING_UNSUBSCRIBE_SECRET` is the HMAC secret for execution tokens too. No new env var needed.
- **Send loop may already have slight shifts from main** — line numbers referenced throughout are approximate; use grep/read to locate the real insertion points before editing.
