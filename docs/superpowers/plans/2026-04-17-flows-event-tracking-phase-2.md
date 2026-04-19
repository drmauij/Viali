# Flows Event Tracking (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `DUMMY_STATS` in the Flows dashboard with real engagement data sourced from a Resend webhook, plus per-campaign metrics + drill-down view, plus per-campaign booking attribution via stable `utm_content = flow.id` join key.

**Architecture:** New `POST /api/webhooks/resend` endpoint verifies Svix signatures (HMAC-SHA256, replay-protected) and writes engagement events to existing `flow_events` table, looking up the flow execution by a new `resend_email_id` column captured at send time. Two new metrics endpoints aggregate sent/delivered/opened/clicked/bounced/complained from `flow_events` and join `referral_events` on `utm_content = flow.id` for booking counts. Frontend gets a real summary in `Flows.tsx` plus a new drill-down page.

**Tech Stack:** Drizzle + Postgres, Express, Node `crypto` (HMAC-SHA256, no new deps), Vitest + Supertest, Resend webhooks (Svix-compatible signing), Recharts (already a dep).

**Spec:** `docs/superpowers/specs/2026-04-17-flows-event-tracking-phase-2-design.md`

**Prerequisite env var (operator):** `RESEND_WEBHOOK_SECRET` must be set in production. In Resend dashboard, register webhook URL `https://use.viali.app/api/webhooks/resend`, paste the secret, subscribe to `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.

---

## File Structure

**New files:**
- `migrations/0225_flow_executions_resend_email_id.sql` — idempotent ALTER + partial index
- `server/services/svixSignature.ts` — `verifySvixSignature()` (HMAC-SHA256 with replay protection)
- `server/services/marketingMetricsQuery.ts` — `summarizeFlows(hospitalId, since)` and `flowDetail(flowId)` query helpers
- `server/routes/marketingWebhooks.ts` — `POST /api/webhooks/resend` handler
- `client/src/pages/business/FlowMetrics.tsx` — drill-down page
- `tests/svix-signature.test.ts`
- `tests/marketing-webhooks-resend.test.ts`
- `tests/marketing-metrics-query.test.ts`

**Modified files:**
- `shared/schema.ts` (around line 6916 — verify with grep) — add `resendEmailId` column + partial index to `flow_executions`
- `server/routes/index.ts` — register `marketingWebhooksRouter` between `marketingUnsubscribeRouter` and `publicDocsRouter`
- `server/routes/flows.ts` (around line 1089-1091) — add `params.set("utm_content", flow.id)` to booking URL builder
- `server/routes/flows.ts` (around line 1149) — capture `sendResult.data?.id` and persist on `flow_executions`
- `server/routes/flows.ts` (end of file) — add two new GET endpoints: `/metrics/summary` and `/:flowId/metrics`
- `client/src/App.tsx` — register `/business/flows/:id/metrics` route
- `client/src/pages/business/Flows.tsx:29-34` — kill `DUMMY_STATS`, fetch real summary, per-row mini-strip, "View metrics" link
- `server/routes/publicDocs.ts` — document `/api/webhooks/resend` section
- `tests/public-docs.test.ts` — assert webhook path documented

---

## Task 1: Schema + idempotent migration

**Files:**
- Modify: `shared/schema.ts` (`flowExecutions` table, currently around line 6916)
- Create: `migrations/0225_flow_executions_resend_email_id.sql`
- Modify: `migrations/meta/_journal.json` (current last idx is 224 with when=1777700000000; this task adds idx 225 with when=1777800000000)

- [ ] **Step 1: Add column + partial index to schema.ts**

In `shared/schema.ts`, locate the `flowExecutions` pgTable definition. Add `resendEmailId` after the existing columns and a partial index:

```typescript
export const flowExecutions = pgTable("flow_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flowId: varchar("flow_id").notNull().references(() => flows.id, { onDelete: 'cascade' }),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  resendEmailId: varchar("resend_email_id"),
}, (table) => [
  index("idx_flow_executions_flow").on(table.flowId),
  index("idx_flow_executions_patient").on(table.patientId),
  index("idx_flow_executions_resend_email_id")
    .on(table.resendEmailId)
    .where(sql`${table.resendEmailId} IS NOT NULL`),
]);
```

Preserve all existing columns and the existing two indexes — only ADD the new column and the new partial index.

- [ ] **Step 2: Write the migration SQL**

Create `migrations/0225_flow_executions_resend_email_id.sql`:

```sql
-- Migration 0225: track Resend message IDs on flow executions
-- Lets the webhook map incoming events back to a flow_execution row.
-- Partial index — most rows have NULL (SMS sends, transactional sends).
-- Idempotent.

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "resend_email_id" varchar;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_resend_email_id"
  ON "flow_executions" ("resend_email_id")
  WHERE "resend_email_id" IS NOT NULL;
```

- [ ] **Step 3: Register migration in journal**

Open `migrations/meta/_journal.json`. The current last entry is `idx: 224, when: 1777700000000, tag: "0224_service_folders"`. Append a new entry (insert a comma after the current last `}`):

```json
    ,{
      "idx": 225,
      "version": "7",
      "when": 1777800000000,
      "tag": "0225_flow_executions_resend_email_id",
      "breakpoints": true
    }
```

Make sure the closing `]` and `}` at the end of the file remain intact and the `when` (`1777800000000`) is the new highest value in the file.

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0, no errors.

- [ ] **Step 5: Verify migration is idempotent**

Run: `cd /home/mau/viali-flows-event-tracking && npm run db:migrate`
Expected: applies cleanly.
Run: `cd /home/mau/viali-flows-event-tracking && npm run db:migrate` (second time)
Expected: no-op, no error (the `IF NOT EXISTS` guards skip).

- [ ] **Step 6: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add shared/schema.ts migrations/0225_flow_executions_resend_email_id.sql migrations/meta/_journal.json
git commit -m "feat(flows): track Resend message id on flow_executions"
```

---

## Task 2: Svix signature helper (TDD)

**Files:**
- Create: `server/services/svixSignature.ts`
- Test: `tests/svix-signature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/svix-signature.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { verifySvixSignature } from "../server/services/svixSignature";

const SECRET = "test-svix-secret";

function computeSignature(secret: string, msgId: string, ts: string, body: string) {
  // Resend's secret format is "whsec_..." but the verification needs the raw secret
  // (Svix's standard). For tests we use a raw secret directly.
  return "v1," + createHmac("sha256", secret).update(`${msgId}.${ts}.${body}`).digest("base64");
}

describe("verifySvixSignature", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  const body = '{"type":"email.opened","data":{"email_id":"abc"}}';
  const nowSec = Math.floor(Date.now() / 1000).toString();
  const msgId = "msg_test_1";

  it("accepts a valid signature", () => {
    const sig = computeSignature(SECRET, msgId, nowSec, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: sig,
      rawBody: body,
    })).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const sig = computeSignature(SECRET, msgId, nowSec, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: sig,
      rawBody: body + "X",
    })).toThrow(/invalid/i);
  });

  it("rejects a bad signature", () => {
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: "v1,deadbeef",
      rawBody: body,
    })).toThrow(/invalid/i);
  });

  it("rejects a stale timestamp (older than 5 minutes)", () => {
    const stale = (Math.floor(Date.now() / 1000) - 6 * 60).toString();
    const sig = computeSignature(SECRET, msgId, stale, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: stale,
      svixSignature: sig,
      rawBody: body,
    })).toThrow(/timestamp/i);
  });

  it("rejects a future timestamp (more than 5 minutes ahead)", () => {
    const future = (Math.floor(Date.now() / 1000) + 6 * 60).toString();
    const sig = computeSignature(SECRET, msgId, future, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: future,
      svixSignature: sig,
      rawBody: body,
    })).toThrow(/timestamp/i);
  });

  it("accepts a multi-signature header (rotation) when one matches", () => {
    const validSig = computeSignature(SECRET, msgId, nowSec, body);
    const multi = `v1,deadbeef ${validSig}`; // space-separated per Svix spec
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: multi,
      rawBody: body,
    })).not.toThrow();
  });

  it("rejects when secret env var is unset", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const sig = computeSignature(SECRET, msgId, nowSec, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: sig,
      rawBody: body,
    })).toThrow(/secret/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/svix-signature.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `server/services/svixSignature.ts`:

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

interface VerifyArgs {
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
}

const TOLERANCE_SECONDS = 5 * 60;

function getSecret(): string {
  // Resend prefixes their secret with "whsec_". The Svix verification scheme
  // signs with the raw bytes after the prefix, but we accept the secret as-is
  // and let the operator set it however Resend gave it (with or without prefix).
  const raw = process.env.RESEND_WEBHOOK_SECRET;
  if (!raw) throw new Error("RESEND_WEBHOOK_SECRET must be set");
  return raw.startsWith("whsec_") ? raw.slice("whsec_".length) : raw;
}

function computeExpected(secret: string, msgId: string, ts: string, body: string): Buffer {
  return createHmac("sha256", secret)
    .update(`${msgId}.${ts}.${body}`)
    .digest();
}

export function verifySvixSignature(args: VerifyArgs): void {
  const { svixId, svixTimestamp, svixSignature, rawBody } = args;
  const secret = getSecret();

  // Replay protection
  const tsNum = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(tsNum)) {
    throw new Error("Invalid svix timestamp");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > TOLERANCE_SECONDS) {
    throw new Error("Svix timestamp outside tolerance window");
  }

  // Signature header may contain multiple space-separated `v1,<base64>` entries
  // (during secret rotation Svix sends both old and new signatures).
  const candidates = svixSignature.split(" ").filter(Boolean);
  const expected = computeExpected(secret, svixId, svixTimestamp, rawBody);

  let matched = false;
  for (const candidate of candidates) {
    const [version, b64] = candidate.split(",");
    if (version !== "v1" || !b64) continue;
    let actual: Buffer;
    try {
      actual = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (actual.length !== expected.length) continue;
    if (timingSafeEqual(actual, expected)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    throw new Error("Invalid svix signature");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/svix-signature.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add server/services/svixSignature.ts tests/svix-signature.test.ts
git commit -m "feat(flows): Svix-compatible HMAC signature verifier"
```

---

## Task 3: Resend webhook endpoint (TDD)

**Files:**
- Create: `server/routes/marketingWebhooks.ts`
- Modify: `server/routes/index.ts`
- Test: `tests/marketing-webhooks-resend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/marketing-webhooks-resend.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

const SECRET = "test-svix-secret";

// DB call captures
const insertedFlowEvents: any[] = [];
const updatedPatients: any[] = [];
let executionLookupResult: any = null;

vi.mock("../server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(executionLookupResult ? [executionLookupResult] : [])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => {
        insertedFlowEvents.push(row);
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: any) => ({
        where: vi.fn(() => {
          updatedPatients.push(patch);
          return Promise.resolve();
        }),
      })),
    })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  insertedFlowEvents.length = 0;
  updatedPatients.length = 0;
  executionLookupResult = null;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
});

import marketingWebhooksRouter from "../server/routes/marketingWebhooks";

function buildApp() {
  const app = express();
  // We need raw body for signature verification, so register raw parser
  // BEFORE the router and let the router handle JSON parsing internally.
  app.use("/api/webhooks/resend", express.raw({ type: "*/*" }));
  app.use(marketingWebhooksRouter);
  return app;
}

function send(body: any, opts: { tamper?: boolean; staleTs?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = opts.staleTs
    ? (Math.floor(Date.now() / 1000) - 6 * 60).toString()
    : Math.floor(Date.now() / 1000).toString();
  const msgId = "msg_test";
  const sig = "v1," + createHmac("sha256", SECRET).update(`${msgId}.${ts}.${raw}`).digest("base64");
  const app = buildApp();
  return request(app)
    .post("/api/webhooks/resend")
    .set("svix-id", msgId)
    .set("svix-timestamp", ts)
    .set("svix-signature", sig)
    .set("content-type", "application/json")
    .send(opts.tamper ? raw + "X" : raw);
}

describe("POST /api/webhooks/resend", () => {
  it("returns 400 on tampered body (signature failure)", async () => {
    const res = await send({ type: "email.opened", data: { email_id: "abc" } }, { tamper: true });
    expect(res.status).toBe(400);
    expect(insertedFlowEvents).toHaveLength(0);
  });

  it("returns 400 on stale timestamp", async () => {
    const res = await send({ type: "email.opened", data: { email_id: "abc" } }, { staleTs: true });
    expect(res.status).toBe(400);
  });

  it("returns 200 + no-op when execution not found (transactional email)", async () => {
    executionLookupResult = null;
    const res = await send({ type: "email.opened", data: { email_id: "unknown_id" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
    expect(updatedPatients).toHaveLength(0);
  });

  it("writes flow_event for email.opened on known execution", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.opened",
      data: { email_id: "abc", recipient: "x@y.com" },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(1);
    expect(insertedFlowEvents[0]).toMatchObject({
      executionId: "exec_1",
      eventType: "opened",
    });
    expect(updatedPatients).toHaveLength(0);
  });

  it("writes flow_event for email.delivered", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.delivered", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0].eventType).toBe("delivered");
  });

  it("writes flow_event for email.clicked", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.clicked",
      data: { email_id: "abc", click: { link: "https://viali.app/book/x" } },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0].eventType).toBe("clicked");
    expect(insertedFlowEvents[0].metadata).toMatchObject({
      click: { link: "https://viali.app/book/x" },
    });
  });

  it("writes flow_event for email.bounced WITHOUT touching consent flags", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.bounced",
      data: { email_id: "abc", bounce: { subType: "Permanent" } },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0].eventType).toBe("bounced");
    expect(updatedPatients).toHaveLength(0);
  });

  it("writes flow_event for email.complained AND flips consent flags", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({
      type: "email.complained",
      data: { email_id: "abc" },
    });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents[0].eventType).toBe("complained");
    expect(updatedPatients).toHaveLength(1);
    expect(updatedPatients[0].emailMarketingConsent).toBe(false);
    expect(updatedPatients[0].marketingUnsubscribedAt).toBeInstanceOf(Date);
  });

  it("returns 200 + no-op for email.delivery_delayed", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.delivery_delayed", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
  });

  it("returns 200 + no-op for an unknown event type", async () => {
    executionLookupResult = { id: "exec_1", patientId: "pat_1" };
    const res = await send({ type: "email.nuclear_meltdown", data: { email_id: "abc" } });
    expect(res.status).toBe(200);
    expect(insertedFlowEvents).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/marketing-webhooks-resend.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `server/routes/marketingWebhooks.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { flowExecutions, flowEvents, patients } from "../../shared/schema";
import { verifySvixSignature } from "../services/svixSignature";
import logger from "../logger";

const router = Router();

// Note: this route requires raw body for signature verification. The caller
// (server/routes/index.ts or the main app setup) must register
// `express.raw({ type: "*/*" })` on this path BEFORE the router runs.
router.post("/api/webhooks/resend", async (req: Request, res: Response) => {
  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).send("missing svix headers");
    return;
  }

  // req.body is a Buffer when express.raw() middleware is used.
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

  try {
    verifySvixSignature({ svixId, svixTimestamp, svixSignature, rawBody });
  } catch (err) {
    logger.warn("[resend webhook] signature failure:", (err as Error).message);
    res.status(400).send("invalid signature");
    return;
  }

  let payload: { type?: string; data?: { email_id?: string; [k: string]: any } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).send("invalid json");
    return;
  }

  const eventType = payload.type;
  const emailId = payload.data?.email_id;

  if (!eventType || !emailId) {
    // Acknowledge but do nothing — Resend retries non-2xx
    res.status(200).send("ok");
    return;
  }

  // Look up the execution
  const [execution] = await db
    .select({ id: flowExecutions.id, patientId: flowExecutions.patientId })
    .from(flowExecutions)
    .where(eq(flowExecutions.resendEmailId, emailId))
    .limit(1);

  if (!execution) {
    // Transactional email or pre-Phase-2 send — silently acknowledge
    res.status(200).send("ok");
    return;
  }

  switch (eventType) {
    case "email.sent":
    case "email.delivered":
    case "email.opened":
    case "email.clicked":
    case "email.bounced": {
      const localType = eventType.replace("email.", ""); // sent, delivered, opened, clicked, bounced
      await db.insert(flowEvents).values({
        executionId: execution.id,
        eventType: localType,
        metadata: payload.data ?? null,
      });
      break;
    }

    case "email.complained": {
      await db.insert(flowEvents).values({
        executionId: execution.id,
        eventType: "complained",
        metadata: payload.data ?? null,
      });
      // Auto-opt-out: complaint is an unambiguous "stop emailing me" signal.
      await db
        .update(patients)
        .set({
          emailMarketingConsent: false,
          marketingUnsubscribedAt: new Date(),
        })
        .where(eq(patients.id, execution.patientId));
      logger.warn(
        `[resend webhook] complaint flipped emailMarketingConsent=false for patient ${execution.patientId}`,
      );
      break;
    }

    case "email.delivery_delayed":
      // Resend will retry automatically — noise, drop silently
      break;

    default:
      logger.debug(`[resend webhook] unknown event type: ${eventType}`);
      break;
  }

  res.status(200).send("ok");
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/marketing-webhooks-resend.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 5: Register router in routes index**

Open `server/routes/index.ts`. After the existing line (around 36):

```typescript
import marketingUnsubscribeRouter from "./marketingUnsubscribe";
```

Add:

```typescript
import marketingWebhooksRouter from "./marketingWebhooks";
```

Then inside `registerDomainRoutes(app)`, find the existing block:

```typescript
  app.use(flowsRouter);
  app.use(marketingUnsubscribeRouter);
  app.use(publicDocsRouter);
```

Insert the raw-body parser registration AND the router between the unsubscribe router and the public docs router:

```typescript
  app.use(flowsRouter);
  app.use(marketingUnsubscribeRouter);
  // Resend webhook needs raw body for signature verification — register
  // express.raw on this path before the router runs.
  app.use("/api/webhooks/resend", (await import("express")).default.raw({ type: "*/*" }));
  app.use(marketingWebhooksRouter);
  app.use(publicDocsRouter);
```

If `registerDomainRoutes` is not currently `async`, change it to async:

```typescript
export async function registerDomainRoutes(app: Express) {
```

If that ripples to the caller (likely in `server/index.ts` where `registerDomainRoutes` is called), update that call site to `await registerDomainRoutes(app)`.

**Alternative (simpler if the await ripples too far):** import express at the top of the file and use synchronously:

```typescript
import express from "express";
// ... in the function:
  app.use("/api/webhooks/resend", express.raw({ type: "*/*" }));
  app.use(marketingWebhooksRouter);
```

Use whichever style matches the existing file. Verify by reading the top of `server/routes/index.ts` for existing express imports.

- [ ] **Step 6: Verify typecheck**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add server/routes/marketingWebhooks.ts server/routes/index.ts tests/marketing-webhooks-resend.test.ts
git commit -m "feat(flows): Resend webhook handler with consent auto-opt-out on complaint"
```

---

## Task 4: Capture Resend message id + add utm_content to send loop

**Files:**
- Modify: `server/routes/flows.ts:1089-1091` (UTM params block)
- Modify: `server/routes/flows.ts:1149` (email send block)

- [ ] **Step 1: Add utm_content to UTM params**

In `server/routes/flows.ts`, find the URL builder around line 1089–1091:

```typescript
      params.set("utm_source", flow.channel === "sms" ? "sms_campaign" : "email_campaign");
      params.set("utm_medium", flow.channel === "sms" ? "sms" : "email");
      params.set("utm_campaign", flow.name || "campaign");
```

Add one line below `utm_campaign`:

```typescript
      params.set("utm_source", flow.channel === "sms" ? "sms_campaign" : "email_campaign");
      params.set("utm_medium", flow.channel === "sms" ? "sms" : "email");
      params.set("utm_campaign", flow.name || "campaign");
      // Stable join key for booking attribution — survives flow renames and same-name collisions.
      params.set("utm_content", flow.id);
```

- [ ] **Step 2: Capture Resend message id at send time**

In the same file, find the email-send block around lines 1149–1154. Currently:

```typescript
              await client.emails.send({
                from: fromEmail,
                to: patient.email,
                subject,
                html: htmlWithFooter,
              });
              sendSuccess = true;
```

Change to:

```typescript
              const sendResult = await client.emails.send({
                from: fromEmail,
                to: patient.email,
                subject,
                html: htmlWithFooter,
              });
              if (sendResult.data?.id) {
                await db
                  .update(flowExecutions)
                  .set({ resendEmailId: sendResult.data.id })
                  .where(eq(flowExecutions.id, execution.id));
              }
              sendSuccess = !!sendResult.data?.id;
```

(The `sendSuccess = !!sendResult.data?.id` change is a small improvement — Resend may return an `error` object instead of throwing, in which case `data` is null. Better to count it as a failed send than silently mark success.)

- [ ] **Step 3: Verify typecheck**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add server/routes/flows.ts
git commit -m "feat(flows): capture Resend email id + utm_content for attribution"
```

---

## Task 5: Metrics query helpers (TDD)

**Files:**
- Create: `server/services/marketingMetricsQuery.ts`
- Test: `tests/marketing-metrics-query.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/marketing-metrics-query.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture executed SQL strings to verify the query shape.
const capturedSql: string[] = [];

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(async (sqlObj: any) => {
      // Drizzle's sql template returns an object with .queryChunks etc.
      // For the test, we serialize it so we can assert the right columns appear.
      const serialized = JSON.stringify(sqlObj);
      capturedSql.push(serialized);
      // Return shape varies by query — return empty rows by default.
      return { rows: [] } as any;
    }),
  },
}));

beforeEach(() => {
  capturedSql.length = 0;
  vi.clearAllMocks();
});

import { summarizeFlows, flowDetail } from "../server/services/marketingMetricsQuery";

describe("summarizeFlows", () => {
  it("queries flow_events with COUNT FILTER for each event type", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    expect(capturedSql.length).toBeGreaterThanOrEqual(1);
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("flow_events");
    expect(allSql).toContain("flow_executions");
    expect(allSql).toContain("'sent'");
    expect(allSql).toContain("'delivered'");
    expect(allSql).toContain("'opened'");
    expect(allSql).toContain("'clicked'");
    expect(allSql).toContain("'bounced'");
    expect(allSql).toContain("'complained'");
  });

  it("uses COUNT DISTINCT for opened and clicked", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    const allSql = capturedSql.join(" ");
    // Opens and clicks may fire multiple times per execution — distinct.
    expect(allSql).toMatch(/distinct.*opened/i);
    expect(allSql).toMatch(/distinct.*clicked/i);
  });

  it("queries referral_events for booking counts joined on utm_content", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("referral_events");
    expect(allSql).toContain("utm_content");
  });

  it("scopes by hospital_id and the since timestamp", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("hospital_id");
    expect(allSql.toLowerCase()).toContain("started_at");
  });
});

describe("flowDetail", () => {
  it("queries funnel + bounces + complaints + daily series", async () => {
    await flowDetail("flow_xyz");
    expect(capturedSql.length).toBeGreaterThanOrEqual(4);
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("flow_xyz"); // flow id appears as a parameter
    expect(allSql).toContain("'bounced'");
    expect(allSql).toContain("'complained'");
    // Time-series uses DATE() grouping
    expect(allSql.toLowerCase()).toMatch(/date\(.*created_at\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/marketing-metrics-query.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `server/services/marketingMetricsQuery.ts`:

```typescript
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface FlowSummaryRow {
  flowId: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  bookings: number;
}

export async function summarizeFlows(
  hospitalId: string,
  since: Date,
): Promise<FlowSummaryRow[]> {
  const eventCountsResult = await db.execute(sql`
    SELECT
      fe.flow_id AS "flowId",
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')      AS sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered') AS delivered,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')  AS opened,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked') AS clicked,
      COUNT(*) FILTER (WHERE ev.event_type = 'bounced')   AS bounced,
      COUNT(*) FILTER (WHERE ev.event_type = 'complained') AS complained
    FROM flow_executions fe
    JOIN flow_events ev ON ev.execution_id = fe.id
    JOIN flows f ON f.id = fe.flow_id
    WHERE f.hospital_id = ${hospitalId}
      AND fe.started_at >= ${since.toISOString()}
    GROUP BY fe.flow_id
  `);

  const eventRows: any[] = (eventCountsResult as any).rows ?? [];

  const bookingCountsResult = await db.execute(sql`
    SELECT
      re.utm_content AS "flowId",
      COUNT(*) FILTER (WHERE re.appointment_id IS NOT NULL) AS bookings
    FROM referral_events re
    WHERE re.hospital_id = ${hospitalId}
      AND re.utm_content IS NOT NULL
      AND re.created_at >= ${since.toISOString()}
    GROUP BY re.utm_content
  `);

  const bookingRows: any[] = (bookingCountsResult as any).rows ?? [];
  const bookingsByFlow: Record<string, number> = {};
  for (const r of bookingRows) {
    bookingsByFlow[r.flowId] = Number(r.bookings) || 0;
  }

  return eventRows.map((r): FlowSummaryRow => ({
    flowId: r.flowId,
    sent: Number(r.sent) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    bounced: Number(r.bounced) || 0,
    complained: Number(r.complained) || 0,
    bookings: bookingsByFlow[r.flowId] ?? 0,
  }));
}

export interface FlowDetailResult {
  funnel: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
  };
  bounces: Array<{ email: string; bounceType: string | null; createdAt: Date }>;
  complaints: Array<{ email: string; createdAt: Date }>;
  series: Array<{ day: string; opened: number; clicked: number }>;
}

export async function flowDetail(flowId: string): Promise<FlowDetailResult> {
  const funnelResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')      AS sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered') AS delivered,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')  AS opened,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked') AS clicked,
      COUNT(*) FILTER (WHERE ev.event_type = 'bounced')   AS bounced,
      COUNT(*) FILTER (WHERE ev.event_type = 'complained') AS complained
    FROM flow_executions fe
    JOIN flow_events ev ON ev.execution_id = fe.id
    WHERE fe.flow_id = ${flowId}
  `);
  const funnelRow: any = (funnelResult as any).rows?.[0] ?? {};

  const bookingResult = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE re.appointment_id IS NOT NULL) AS bookings
    FROM referral_events re
    WHERE re.utm_content = ${flowId}
  `);
  const bookings = Number((bookingResult as any).rows?.[0]?.bookings) || 0;

  const bouncesResult = await db.execute(sql`
    SELECT
      p.email AS email,
      ev.metadata->>'subType' AS "bounceType",
      ev.created_at AS "createdAt"
    FROM flow_events ev
    JOIN flow_executions fe ON fe.id = ev.execution_id
    JOIN patients p ON p.id = fe.patient_id
    WHERE ev.event_type = 'bounced'
      AND fe.flow_id = ${flowId}
    ORDER BY ev.created_at DESC
    LIMIT 100
  `);

  const complaintsResult = await db.execute(sql`
    SELECT
      p.email AS email,
      ev.created_at AS "createdAt"
    FROM flow_events ev
    JOIN flow_executions fe ON fe.id = ev.execution_id
    JOIN patients p ON p.id = fe.patient_id
    WHERE ev.event_type = 'complained'
      AND fe.flow_id = ${flowId}
    ORDER BY ev.created_at DESC
    LIMIT 100
  `);

  const seriesResult = await db.execute(sql`
    SELECT
      DATE(ev.created_at) AS day,
      COUNT(*) FILTER (WHERE ev.event_type = 'opened')  AS opened,
      COUNT(*) FILTER (WHERE ev.event_type = 'clicked') AS clicked
    FROM flow_events ev
    JOIN flow_executions fe ON fe.id = ev.execution_id
    WHERE fe.flow_id = ${flowId}
    GROUP BY DATE(ev.created_at)
    ORDER BY day
  `);

  return {
    funnel: {
      sent: Number(funnelRow.sent) || 0,
      delivered: Number(funnelRow.delivered) || 0,
      opened: Number(funnelRow.opened) || 0,
      clicked: Number(funnelRow.clicked) || 0,
      bounced: Number(funnelRow.bounced) || 0,
      complained: Number(funnelRow.complained) || 0,
      bookings,
    },
    bounces: ((bouncesResult as any).rows ?? []).map((r: any) => ({
      email: r.email,
      bounceType: r.bounceType,
      createdAt: new Date(r.createdAt),
    })),
    complaints: ((complaintsResult as any).rows ?? []).map((r: any) => ({
      email: r.email,
      createdAt: new Date(r.createdAt),
    })),
    series: ((seriesResult as any).rows ?? []).map((r: any) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
      opened: Number(r.opened) || 0,
      clicked: Number(r.clicked) || 0,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/marketing-metrics-query.test.ts`
Expected: all 6 tests PASS.

If a test fails because the SQL serialization doesn't surface the column names cleanly (Drizzle's internal sql object structure), inspect a captured query with `console.log(JSON.stringify(capturedSql[0], null, 2))` and adjust assertions to match the actual structure. The walker pattern from `tests/flows-consent-integration.test.ts` is the fallback.

- [ ] **Step 5: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add server/services/marketingMetricsQuery.ts tests/marketing-metrics-query.test.ts
git commit -m "feat(flows): metrics aggregation queries"
```

---

## Task 6: Metrics API endpoints

**Files:**
- Modify: `server/routes/flows.ts` (append two new GET endpoints, before `export default router;`)

- [ ] **Step 1: Add the metrics endpoints**

Open `server/routes/flows.ts`. Add the helper import at the top of the file with the other imports:

```typescript
import { summarizeFlows, flowDetail } from "../services/marketingMetricsQuery";
```

At the bottom of the file (right before `export default router;`), add:

```typescript
// ─── Metrics ──────────────────────────────────────────────────

router.get(
  "/api/business/:hospitalId/flows/metrics/summary",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam
        ? new Date(sinceParam)
        : (() => {
            const d = new Date();
            d.setUTCDate(1);
            d.setUTCHours(0, 0, 0, 0);
            return d;
          })();
      if (Number.isNaN(since.getTime())) {
        return res.status(400).json({ message: "Invalid since parameter" });
      }
      const rows = await summarizeFlows(hospitalId, since);
      res.json({ since: since.toISOString(), rows });
    } catch (err) {
      logger.error("[flows] metrics summary error:", err);
      res.status(500).json({ message: "Failed to load summary" });
    }
  },
);

router.get(
  "/api/business/:hospitalId/flows/:flowId/metrics",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      // Verify the flow belongs to this hospital before exposing detail
      const [flow] = await db
        .select({ id: flows.id })
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      const detail = await flowDetail(flowId);
      res.json(detail);
    } catch (err) {
      logger.error("[flows] flow detail metrics error:", err);
      res.status(500).json({ message: "Failed to load flow detail" });
    }
  },
);
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0.

- [ ] **Step 3: Smoke test the endpoints (no formal test file)**

The query helpers themselves are tested in Task 5. The endpoints are thin wrappers — auth gate + parse query → call helper → return JSON. A formal endpoint test would mostly retest the helper. If the endpoint logic ever grows beyond "call helper", add a test then.

Smoke check via curl (with the dev server running, replace `<HID>` with a real hospital id and `<COOKIE>` with a real session cookie):

```bash
# Summary endpoint
curl -s -H "Cookie: <COOKIE>" "http://localhost:5000/api/business/<HID>/flows/metrics/summary" | jq

# Detail endpoint (use a real flow id from the list)
curl -s -H "Cookie: <COOKIE>" "http://localhost:5000/api/business/<HID>/flows/<FID>/metrics" | jq
```

Expected: both return JSON (probably empty arrays / zero counts on a fresh dev DB) with no 500 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add server/routes/flows.ts
git commit -m "feat(flows): metrics summary and detail endpoints"
```

---

## Task 7: Frontend — kill DUMMY_STATS, add per-row strip + drill-down link

**Files:**
- Modify: `client/src/pages/business/Flows.tsx`

- [ ] **Step 1: Replace DUMMY_STATS with real query**

Open `client/src/pages/business/Flows.tsx`. Find the DUMMY_STATS constant (around lines 29–34):

```typescript
  const DUMMY_STATS = [
    { label: t("flows.dashboard.campaigns", "Campaigns This Month"), value: "12", icon: Send, color: "text-purple-400" },
    { label: t("flows.dashboard.reached", "Recipients Reached"), value: "384", icon: Users, color: "text-blue-400" },
    { label: t("flows.dashboard.openRate", "Avg. Open Rate"), value: "34%", icon: BarChart3, color: "text-green-400" },
    { label: t("flows.dashboard.bookings", "Bookings"), value: "28", icon: CalendarCheck, color: "text-orange-400" },
  ];
```

Delete the constant. Below the existing campaigns query, add:

```typescript
  const { data: metricsSummary } = useQuery<{
    since: string;
    rows: Array<{
      flowId: string;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complained: number;
      bookings: number;
    }>;
  }>({
    queryKey: ["flows-metrics-summary", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/business/${hospitalId}/flows/metrics/summary`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const metricsByFlow = useMemo(() => {
    const m: Record<string, typeof metricsSummary extends { rows: infer R } ? R extends Array<infer X> ? X : never : never> = {};
    (metricsSummary?.rows ?? []).forEach((r) => { m[r.flowId] = r; });
    return m;
  }, [metricsSummary]);

  const STATS = useMemo(() => {
    const rows = metricsSummary?.rows ?? [];
    const totals = rows.reduce(
      (acc, r) => ({
        sent: acc.sent + r.sent,
        opened: acc.opened + r.opened,
        bookings: acc.bookings + r.bookings,
      }),
      { sent: 0, opened: 0, bookings: 0 },
    );
    const openRate = totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0;
    return [
      { label: t("flows.dashboard.campaigns", "Campaigns This Month"), value: String(rows.length), icon: Send, color: "text-purple-400" },
      { label: t("flows.dashboard.reached", "Recipients Reached"), value: String(totals.sent), icon: Users, color: "text-blue-400" },
      { label: t("flows.dashboard.openRate", "Avg. Open Rate"), value: `${openRate}%`, icon: BarChart3, color: "text-green-400" },
      { label: t("flows.dashboard.bookings", "Bookings"), value: String(totals.bookings), icon: CalendarCheck, color: "text-orange-400" },
    ];
  }, [metricsSummary, t]);
```

If `useMemo` isn't already imported from React in this file, add it: change `import { useState } from "react";` to `import { useState, useMemo } from "react";` (or whichever React imports already exist).

Find the existing rendering of `DUMMY_STATS.map(...)` and replace `DUMMY_STATS` with `STATS`.

- [ ] **Step 2: Add per-row mini-strip + "View metrics" link**

Find the `TableRow` for each campaign (search for `campaigns.map`). After the existing campaign-name cell content, add a small inline strip showing the per-flow metrics:

```tsx
{metricsByFlow[c.id] && (
  <div className="text-xs text-muted-foreground mt-1">
    {metricsByFlow[c.id].sent} {t("flows.row.sent", "sent")} ·
    {" "}{metricsByFlow[c.id].opened} {t("flows.row.opened", "opened")} ·
    {" "}{metricsByFlow[c.id].bookings} {t("flows.row.booked", "booked")}
  </div>
)}
```

Place this inside the campaign-name `TableCell`, immediately after the existing name + status badge content.

In the actions cell, add a "View metrics" button next to the existing edit/delete actions:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8"
  onClick={() => navigate(`/business/flows/${c.id}/metrics`)}
  title={t("flows.actions.viewMetrics", "View metrics")}
>
  <BarChart3 className="h-4 w-4" />
</Button>
```

(If `BarChart3` isn't already imported from `lucide-react` in this file, it is — it's used in the STATS array. Verify.)

- [ ] **Step 3: Verify typecheck + dev render**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0.

Run dev server (`npm run dev`), open `/business/flows`, confirm:
- Top stats show real numbers (likely 0 / 0 / 0% / 0 on fresh dev DB)
- Each campaign row has a "View metrics" icon button
- No console errors

- [ ] **Step 4: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add client/src/pages/business/Flows.tsx
git commit -m "feat(flows): real metrics in campaign list (kill DUMMY_STATS)"
```

---

## Task 8: Frontend — drill-down `/business/flows/:id/metrics` page

**Files:**
- Create: `client/src/pages/business/FlowMetrics.tsx`
- Modify: `client/src/App.tsx` (register the new route)

- [ ] **Step 1: Create the metrics page**

Create `client/src/pages/business/FlowMetrics.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface FlowDetail {
  funnel: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
  };
  bounces: Array<{ email: string; bounceType: string | null; createdAt: string }>;
  complaints: Array<{ email: string; createdAt: string }>;
  series: Array<{ day: string; opened: number; clicked: number }>;
}

interface FlowSummary {
  id: string;
  name: string;
  status: string;
  channel: string | null;
  sentAt: string | null;
}

export default function FlowMetrics() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const flowId = params.id;

  const { data: flow } = useQuery<FlowSummary>({
    queryKey: ["flow", hospitalId, flowId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/flows/${flowId}`).then((r) => r.json()),
    enabled: !!hospitalId && !!flowId,
  });

  const { data: metrics, isLoading } = useQuery<FlowDetail>({
    queryKey: ["flow-metrics", hospitalId, flowId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/flows/${flowId}/metrics`).then((r) => r.json()),
    enabled: !!hospitalId && !!flowId,
  });

  if (isLoading || !metrics) {
    return <div className="p-6">{t("common.loading", "Loading...")}</div>;
  }

  const f = metrics.funnel;

  const FUNNEL = [
    { label: t("flows.funnel.sent", "Sent"), value: f.sent },
    { label: t("flows.funnel.delivered", "Delivered"), value: f.delivered },
    { label: t("flows.funnel.opened", "Opened"), value: f.opened },
    { label: t("flows.funnel.clicked", "Clicked"), value: f.clicked },
    { label: t("flows.funnel.booked", "Booked"), value: f.bookings },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/flows")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">{flow?.name ?? t("flows.metrics.title", "Campaign Metrics")}</h1>
        {flow?.status && <Badge variant="outline">{flow.status}</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("flows.funnel.title", "Funnel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {FUNNEL.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          {f.bounced + f.complained > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              {t("flows.metrics.warnings", "Issues")}:
              {" "}{f.bounced} {t("flows.funnel.bounced", "bounced")}
              {" · "}{f.complained} {t("flows.funnel.complained", "complaints")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("flows.metrics.timeline", "Engagement over time")}</CardTitle>
        </CardHeader>
        <CardContent style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={metrics.series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="opened" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
              <Area type="monotone" dataKey="clicked" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {metrics.bounces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("flows.metrics.bouncesTitle", "Bounced recipients")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("flows.metrics.email", "Email")}</TableHead>
                  <TableHead>{t("flows.metrics.bounceType", "Type")}</TableHead>
                  <TableHead>{t("flows.metrics.when", "When")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.bounces.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{b.email}</TableCell>
                    <TableCell>{b.bounceType ?? "—"}</TableCell>
                    <TableCell>{new Date(b.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {metrics.complaints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("flows.metrics.complaintsTitle", "Spam complaints (auto-unsubscribed)")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("flows.metrics.email", "Email")}</TableHead>
                  <TableHead>{t("flows.metrics.when", "When")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.complaints.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{c.email}</TableCell>
                    <TableCell>{new Date(c.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

Open `client/src/App.tsx`. Find the existing route registrations for `/business/flows/:id` and `/business/flows/new`. Add a new route entry alongside them:

```tsx
<Route path="/business/flows/:id/metrics">
  {(params) => <FlowMetrics />}
</Route>
```

(Use the same wrapper component the other Flows routes use — likely `requireBusiness` or a `ProtectedRoute`. Match the surrounding pattern exactly.)

Add the import at the top of `App.tsx`:

```tsx
import FlowMetrics from "@/pages/business/FlowMetrics";
```

- [ ] **Step 3: Verify typecheck + render**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0.

Run dev server, navigate to `/business/flows`, click the "View metrics" icon on any campaign, confirm:
- Page renders
- Funnel shows zeros (nothing's been sent yet on dev)
- Empty time-series chart renders (no data)
- No bounce/complaint sections visible (zero rows)
- No console errors

- [ ] **Step 4: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add client/src/pages/business/FlowMetrics.tsx client/src/App.tsx
git commit -m "feat(flows): per-campaign metrics drill-down page"
```

---

## Task 9: Public docs + final verification

**Files:**
- Modify: `server/routes/publicDocs.ts` — append a new section to `PUBLIC_API_MD`
- Modify: `tests/public-docs.test.ts` — assert webhook path documented

- [ ] **Step 1: Add docs section**

Open `server/routes/publicDocs.ts`. Find the end of `PUBLIC_API_MD` (just before the closing backtick). Insert at the end:

```markdown

## Resend webhook

Viali receives email engagement events from Resend at:

\`\`\`
POST /api/webhooks/resend
\`\`\`

- This endpoint is only invoked by Resend's servers — not part of the integration API surface.
- Requests are authenticated via Svix signature headers (\`svix-id\`, \`svix-timestamp\`, \`svix-signature\`) using HMAC-SHA256 with a shared secret. Requests with invalid or stale (>5 min) signatures return 400.
- Subscribed events: \`email.sent\`, \`email.delivered\`, \`email.opened\`, \`email.clicked\`, \`email.bounced\`, \`email.complained\`. Other event types are acknowledged with 200 and ignored.
- Engagement events are written to the internal \`flow_events\` log; \`email.complained\` additionally flips \`email_marketing_consent\` to \`false\` on the recipient patient.
- Returns 200 even for unknown email IDs (transactional emails sent through the same Resend account flow through here too).
```

Match the backtick-escaping style used elsewhere in `PUBLIC_API_MD` for the code fence (looks like the file uses `\`\`\`` literal backticks via escape).

- [ ] **Step 2: Add the docs assertion to tests**

Open `tests/public-docs.test.ts`. Find the `it("references all three public endpoint paths"` test (or whatever it's called now after Phase 1 added `/unsubscribe/`). Add:

```typescript
expect(res.text).toContain("/api/webhooks/resend");
```

- [ ] **Step 3: Run public-docs test**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/public-docs.test.ts`
Expected: all pass.

- [ ] **Step 4: Run all flows-related tests**

Run: `cd /home/mau/viali-flows-event-tracking && npx vitest run tests/marketing-unsubscribe-token.test.ts tests/marketing-consent-filter.test.ts tests/marketing-unsubscribe-endpoint.test.ts tests/flows-consent-integration.test.ts tests/svix-signature.test.ts tests/marketing-webhooks-resend.test.ts tests/marketing-metrics-query.test.ts tests/public-docs.test.ts`
Expected: all pass.

- [ ] **Step 5: Final typecheck**

Run: `cd /home/mau/viali-flows-event-tracking && npm run check`
Expected: exits 0.

- [ ] **Step 6: Verify drizzle schema is in sync**

Run: `cd /home/mau/viali-flows-event-tracking && npx drizzle-kit push`
Expected: "No changes detected" (the migration from Task 1 already brought the DB in line).

- [ ] **Step 7: Commit**

```bash
cd /home/mau/viali-flows-event-tracking
git add server/routes/publicDocs.ts tests/public-docs.test.ts
git commit -m "docs(flows): document Resend webhook endpoint"
```

- [ ] **Step 8: Print branch summary**

```bash
cd /home/mau/viali-flows-event-tracking && git log --oneline c15c75a0..HEAD
```

Report the full commit chain.

---

## Notes for the implementing agent

- **Idempotent migrations are mandatory.** The deploy server re-runs migrations on every boot; every `ALTER TABLE` must use `IF NOT EXISTS`.
- **No new npm dependencies.** HMAC via `node:crypto` (same pattern as Phase 1's unsubscribe token). No `svix` package, no `axios`, no `nodemailer` — Resend SDK is already a dep.
- **Webhook always returns 200 except on signature failure.** Returning 4xx/5xx triggers Resend retries, which spam the logs. Unknown email IDs and unknown event types both return 200 because they're expected (transactional emails, future event types).
- **Don't add SMS delivery callback.** That's deferred to Phase 2.5 — keep this branch focused.
- **Don't add per-execution attribution token.** That's deferred to Phase 3 (A/B testing).
- **`utm_content = flow.id` is one line in the URL builder.** All downstream pipes (booking page, booking POST, referral_events storage, marketing dashboard) already capture `utm_content` end-to-end — verified in the spec doc.
- **The metrics endpoints are auth-gated by `isAuthenticated + isMarketingAccess`.** Match the style of the existing CRUD endpoints in `flows.ts`.
- **Frontend uses Recharts** (already a dep — see `Marketing.tsx`, `Dashboard.tsx`, `CostAnalytics.tsx`).
