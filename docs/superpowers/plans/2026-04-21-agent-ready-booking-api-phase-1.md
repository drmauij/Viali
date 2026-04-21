# Agent-Ready Booking API — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Viali's existing 9 `/api/public/booking/:token/*` endpoints discoverable and stable enough for AI agents to use — document them in both Markdown and OpenAPI 3.1, enable CORS, add idempotency, stabilize the error shape, and surface a copy-paste prompt in the admin UI for clinic staff to give to their website builders.

**Architecture:** Two parallel hand-written sources of truth (`PUBLIC_API_MD` + `OPENAPI_SPEC`) kept in sync via tests. No endpoint implementations are added or removed. `POST /book` gains an optional `Idempotency-Key` header backed by a small `booking_idempotency_keys` table. All error responses on `/api/public/booking/*` unify to `{ code, message }` with English messages.

**Tech Stack:** Node 20, TypeScript, Express, Drizzle ORM (Postgres), Zod, express-rate-limit, vitest + supertest, React, shadcn/ui, react-i18next.

**Reference spec:** `docs/superpowers/specs/2026-04-21-agent-ready-booking-api-design.md`.

---

## File structure

New files:

- `server/lib/publicApiErrors.ts` — error-code catalog + response helper (one source of truth for codes + English messages)
- `server/routes/publicOpenApi.ts` — `OPENAPI_SPEC` constant + JSON/YAML handlers
- `migrations/<next-number>_booking_idempotency_keys.sql` — idempotent SQL for the new table

Modified files:

- `shared/schema.ts` — add `bookingIdempotencyKeys` Drizzle table
- `server/index.ts` — CORS middleware, raised booking limiter with code-shaped handler, cleanup cron
- `server/routes/clinic.ts` — 7 error sites refactored to catalog; `POST /book` gets `Idempotency-Key` handling
- `server/routes/publicDocs.ts` — new "Booking API (JSON)" Markdown section; extended `LLMS_TXT`
- `server/routes/index.ts` — register `publicOpenApi` router
- `client/src/pages/admin/components/BookingTokenSection.tsx` — "Share with AI agents" button + Dialog
- `client/src/i18n/locales/en.json` + `de.json` — i18n keys for the dialog
- `tests/public-docs.test.ts` — parity + catalog + rate-limit tests
- `package.json` — add `cors`, `@types/cors`, `zod-to-json-schema`, `js-yaml`, `@types/js-yaml`

Follow the project pre-commit rule: every migration file must be idempotent (`IF NOT EXISTS`, `IF EXISTS`, `DO $$ … END $$`).

---

## Task 1: Dependencies + error-code catalog module

**Files:**
- Modify: `package.json`
- Create: `server/lib/publicApiErrors.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install cors zod-to-json-schema js-yaml
npm install -D @types/cors @types/js-yaml
```
Expected: `package.json` gains the four entries; `npm run check` still passes.

- [ ] **Step 2: Create the error catalog**

Create `server/lib/publicApiErrors.ts`:

```ts
import type { Response } from "express";

export const PUBLIC_API_ERROR_CODES = {
  SLOT_TAKEN: {
    status: 409,
    message: "The selected slot is no longer available.",
  },
  INVALID_BOOKING_DATA: {
    status: 400,
    message: "The booking payload is invalid.",
  },
  REFERRAL_REQUIRED: {
    status: 400,
    message: "A referral source is required for this hospital.",
  },
  NOSHOW_FEE_ACK_REQUIRED: {
    status: 400,
    message:
      "This clinic has a no-show-fee notice. The booking request must include noShowFeeAcknowledged: true after the notice has been shown to the patient.",
  },
  PROVIDER_NOT_BOOKABLE: {
    status: 404,
    message: "The requested provider is not available for public booking.",
  },
  HOSPITAL_NOT_FOUND: {
    status: 404,
    message: "Booking page not found.",
  },
  PROMO_INVALID: {
    status: 404,
    message: "The promo code is unknown or expired.",
  },
  CANCELLATION_DISABLED: {
    status: 403,
    message:
      "This clinic does not allow patient-initiated cancellation. Contact the clinic directly.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many booking attempts, please try again later.",
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message:
      "This Idempotency-Key has been used with a different request body.",
  },
} as const;

export type PublicApiErrorCode = keyof typeof PUBLIC_API_ERROR_CODES;

export function sendPublicApiError(
  res: Response,
  code: PublicApiErrorCode,
  extra?: Record<string, unknown>,
) {
  const entry = PUBLIC_API_ERROR_CODES[code];
  return res.status(entry.status).json({
    code,
    message: entry.message,
    ...(extra ?? {}),
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: exit 0, no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server/lib/publicApiErrors.ts
git commit -m "feat(api): add public-API error-code catalog + deps for OpenAPI/CORS"
```

---

## Task 2: Unit test for the error catalog

**Files:**
- Create: `tests/publicApiErrors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/publicApiErrors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  PUBLIC_API_ERROR_CODES,
  sendPublicApiError,
} from "../server/lib/publicApiErrors";

function buildApp() {
  const app = express();
  app.get("/slot-taken", (_req, res) =>
    sendPublicApiError(res, "SLOT_TAKEN"),
  );
  app.get("/with-extra", (_req, res) =>
    sendPublicApiError(res, "INVALID_BOOKING_DATA", {
      fieldErrors: [{ path: "email", message: "invalid" }],
    }),
  );
  return app;
}

describe("sendPublicApiError", () => {
  it("returns { code, message } with the catalog's HTTP status", async () => {
    const res = await request(buildApp()).get("/slot-taken");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: "SLOT_TAKEN",
      message: PUBLIC_API_ERROR_CODES.SLOT_TAKEN.message,
    });
  });

  it("merges extra fields into the response", async () => {
    const res = await request(buildApp()).get("/with-extra");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_BOOKING_DATA");
    expect(res.body.fieldErrors).toEqual([
      { path: "email", message: "invalid" },
    ]);
  });

  it("catalog contains all 10 documented codes", () => {
    expect(Object.keys(PUBLIC_API_ERROR_CODES).sort()).toEqual(
      [
        "CANCELLATION_DISABLED",
        "HOSPITAL_NOT_FOUND",
        "IDEMPOTENCY_CONFLICT",
        "INVALID_BOOKING_DATA",
        "NOSHOW_FEE_ACK_REQUIRED",
        "PROMO_INVALID",
        "PROVIDER_NOT_BOOKABLE",
        "RATE_LIMITED",
        "REFERRAL_REQUIRED",
        "SLOT_TAKEN",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test, confirm it passes**

Run: `npx vitest run tests/publicApiErrors.test.ts`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/publicApiErrors.test.ts
git commit -m "test(api): cover error-code catalog + sendPublicApiError helper"
```

---

## Task 3: Refactor `/api/public/booking/*` error responses to catalog

**Files:**
- Modify: `server/routes/clinic.ts` (7 error sites inside the 9 `/api/public/booking/:bookingToken/*` routes)

Seven sites to change, identified in the current codebase:

| Route (line is approximate) | Current response | New response |
|---|---|---|
| `GET /api/public/booking/:bookingToken` | `res.status(404).json({ message: 'Booking page not found' })` | `sendPublicApiError(res, "HOSPITAL_NOT_FOUND")` |
| `GET .../available-dates` | Same 404 | Same |
| `GET .../closures` | Same 404 | Same |
| `GET .../best-provider` | Same 404 | Same |
| `GET .../services` | Same 404 | Same |
| `GET .../promo/:code` | Whatever current shape is | `sendPublicApiError(res, "PROMO_INVALID")` on miss; `HOSPITAL_NOT_FOUND` on bad token |
| `GET .../prefill` | 404 | `HOSPITAL_NOT_FOUND` |
| `GET .../providers/:providerId/slots` | 404 | `HOSPITAL_NOT_FOUND` |
| `POST .../book` (5 error sites: bad token / invalid payload / referral required / provider not bookable / slot taken) | Mixed German + `{ message }` + `{ message, errors }` + `{ message, code: 'SLOT_TAKEN' }` | `HOSPITAL_NOT_FOUND`, `INVALID_BOOKING_DATA` (with `fieldErrors`), `REFERRAL_REQUIRED`, `PROVIDER_NOT_BOOKABLE`, `SLOT_TAKEN` |

- [ ] **Step 1: Write a failing integration test that pins the shape**

Add to `tests/public-docs.test.ts` (append to existing file):

```ts
// --- Error shape parity (new in agent-ready Phase 1) ---
import clinicRouter from "../server/routes/clinic";

describe("/api/public/booking error shape", () => {
  function buildBookingApp() {
    const app = express();
    app.use(express.json());
    app.use(clinicRouter);
    return app;
  }

  it("returns { code: 'HOSPITAL_NOT_FOUND', message } for an invalid booking token", async () => {
    const res = await request(buildBookingApp()).get(
      "/api/public/booking/does-not-exist-token",
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("HOSPITAL_NOT_FOUND");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message).toMatch(/not found/i);
  });
});
```

Also add tests for the two new enforcement branches. These require the same DB fixture as Task 7's idempotency tests — if a fixture exists, write them; if not, mark as `it.todo` and pick up later:

```ts
describe("POST /book — NOSHOW_FEE_ACK_REQUIRED", () => {
  it.todo(
    "returns 400 NOSHOW_FEE_ACK_REQUIRED when hospital.noShowFeeMessage is set and payload omits noShowFeeAcknowledged",
  );
  it.todo(
    "succeeds when noShowFeeAcknowledged = true",
  );
  it.todo(
    "ignores noShowFeeAcknowledged when hospital.noShowFeeMessage is empty",
  );
});

describe("POST /cancel-by-token — CANCELLATION_DISABLED", () => {
  it.todo(
    "returns 403 CANCELLATION_DISABLED when hospital.hidePatientCancel = true, even with a valid token",
  );
  it.todo(
    "cancels normally when hospital.hidePatientCancel = false",
  );
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run tests/public-docs.test.ts`
Expected: the new `error shape` test fails because today the response is `{ message: 'Booking page not found' }` with no `code` field.

- [ ] **Step 3: Refactor `server/routes/clinic.ts`**

At the top of the file, add:

```ts
import { sendPublicApiError } from "../lib/publicApiErrors";
```

Then replace each error site. Example patches (line numbers are from the current tree — grep for the exact string to locate them if they've drifted):

Replace (around `clinic.ts:365`):
```ts
if (!hospital) {
  return res.status(404).json({ message: 'Booking page not found' });
}
```
with:
```ts
if (!hospital) {
  return sendPublicApiError(res, "HOSPITAL_NOT_FOUND");
}
```

Apply the same `HOSPITAL_NOT_FOUND` substitution to every `!hospital` branch inside every `/api/public/booking/:bookingToken/*` route (there are 9 such routes — grep for `'Booking page not found'` to find them all).

Inside `POST /api/public/booking/:bookingToken/book` (around `clinic.ts:772`):
```ts
const parsed = bookingSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ message: 'Invalid booking data', errors: parsed.error.errors });
}
```
becomes:
```ts
const parsed = bookingSchema.safeParse(req.body);
if (!parsed.success) {
  return sendPublicApiError(res, "INVALID_BOOKING_DATA", {
    fieldErrors: parsed.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  });
}
```

Around `clinic.ts:778` (referral required):
```ts
return res.status(400).json({ message: "Referral source is required" });
```
becomes:
```ts
return sendPublicApiError(res, "REFERRAL_REQUIRED");
```

Around `clinic.ts:809` (provider not bookable):
```ts
return res.status(404).json({ message: 'Provider not found' });
```
becomes:
```ts
return sendPublicApiError(res, "PROVIDER_NOT_BOOKABLE");
```

Around `clinic.ts:828` (slot taken — the German one):
```ts
return res.status(409).json({ message: 'Dieser Termin ist leider nicht mehr verfügbar. …', code: 'SLOT_TAKEN' });
```
becomes:
```ts
return sendPublicApiError(res, "SLOT_TAKEN");
```

**New enforcement (no-show fee ack):** inside `POST /api/public/booking/:bookingToken/book`, after the `bookingSchema.safeParse` block but before the provider lookup, add:

```ts
if (
  (hospital.noShowFeeMessage?.trim().length ?? 0) > 0 &&
  parsed.data.noShowFeeAcknowledged !== true
) {
  return sendPublicApiError(res, "NOSHOW_FEE_ACK_REQUIRED");
}
```

**New enforcement (cancel gating):** inside `POST /api/clinic/appointments/cancel-by-token` (around `clinic.ts:249–284`), after the `appointment.status` check and before the `updateClinicAppointment` call, add:

```ts
if (hospital.hidePatientCancel === true) {
  return sendPublicApiError(res, "CANCELLATION_DISABLED");
}
```

Also rewrite the three existing 404/410/409 responses in `cancel-by-token` and the matching three in `cancel-info/:token` (lines ~59–80 + ~249–276) to use the catalog:

| Current | Becomes |
|---|---|
| `404 { message: 'Token not found' }` | invent `TOKEN_NOT_FOUND`? No — use `HOSPITAL_NOT_FOUND` for "we don't know this token" (closest existing code, keeps the catalog at 10) |
| `410 { message: 'Token already used', alreadyUsed: true }` | **Leave as-is.** These 410s carry state-transition flags (`alreadyUsed`, `expired`) the frontend already handles. Changing their shape is a separate refactor — don't bundle it here. Scope this task to just adding `CANCELLATION_DISABLED` and documenting the endpoints with their existing error shape. |
| `409 { message: 'Appointment cannot be cancelled', status }` | Same — leave as-is. |

So the Task 3 edit to the cancel endpoints is: **only add the `hidePatientCancel` check and the 403 `CANCELLATION_DISABLED` branch.** Leave the existing 404/410/409 shapes. Document the three state-transition responses in the OpenAPI spec (Task 10) as-is with explicit response schemas.

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npx vitest run tests/public-docs.test.ts`
Expected: new `error shape` test passes. Existing tests still pass.

- [ ] **Step 5: Confirm the SPA still renders the right German message after the refactor**

The SPA (`client/src/pages/BookAppointment.tsx`) should already switch on the `code` field. Grep to confirm:

```bash
grep -n "SLOT_TAKEN\|'code'" client/src/pages/BookAppointment.tsx
```
Expected: at least one match. If no match, the SPA currently keys off the German string — add a small follow-up in `BookAppointment.tsx` to key off `response.code === "SLOT_TAKEN"` instead and show the localized German message via `t("book.errors.slotTaken")` (which should already exist — grep it; add it if missing in `de.json` / `en.json`). Commit that SPA change in this task.

- [ ] **Step 6: Typecheck + full test run**

Run: `npm run check && npx vitest run`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add server/routes/clinic.ts tests/public-docs.test.ts client/src/pages/BookAppointment.tsx client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "refactor(api): unify /api/public/booking error shape on code catalog"
```

(Only include the client + locale files in the commit if you actually modified them in step 5.)

---

## Task 4: CORS middleware on `/api/public/booking`

**Files:**
- Modify: `server/index.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/public-docs.test.ts`:

```ts
// --- CORS preflight (new) ---
import { createServer } from "http";

describe("/api/public/booking CORS", () => {
  it("responds to OPTIONS preflight with permissive headers", async () => {
    const app = await import("../server/index").then((m) => m.default ?? m);
    const res = await request(app)
      .options("/api/public/booking/any-token/services")
      .set("Origin", "https://example.com")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Idempotency-Key,Content-Type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toMatch(/GET/);
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(res.headers["access-control-allow-headers"]).toMatch(
      /Idempotency-Key/i,
    );
  });
});
```

If `server/index.ts` does not currently export the `app` instance, export it at the bottom (`export default app;`). Otherwise this test cannot mount it. Add that export if needed.

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/public-docs.test.ts -t "CORS"`
Expected: FAIL — `Access-Control-Allow-Origin` undefined.

- [ ] **Step 3: Add CORS middleware**

In `server/index.ts`, near the other middleware (after `app.use(helmet(...))`, before `app.use(apiLimiter)`):

```ts
import cors from "cors";

const publicAgentCors = cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Idempotency-Key"],
  credentials: false,
  maxAge: 600,
});

app.use("/api/public/booking", publicAgentCors);
// Cancellation endpoints live under /api/clinic/appointments/cancel-* and are
// agent-callable with the patient's action token. They need the same CORS.
app.use("/api/clinic/appointments/cancel-info", publicAgentCors);
app.use("/api/clinic/appointments/cancel-by-token", publicAgentCors);
```

Also add cache headers for read endpoints. Immediately after the CORS middleware:

```ts
app.use("/api/public/booking", (req, res, next) => {
  res.setHeader("X-Robots-Tag", "all");
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "public, max-age=60");
  }
  next();
});
app.use("/api/clinic/appointments/cancel-info", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "all");
  // cancel-info is state-dependent (token may already be used) — no caching.
  res.setHeader("Cache-Control", "no-store");
  next();
});
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/public-docs.test.ts -t "CORS"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts tests/public-docs.test.ts
git commit -m "feat(api): enable CORS + agent-friendly headers on /api/public/booking"
```

---

## Task 5: Idempotency — Drizzle schema + migration

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/<next-number>_booking_idempotency_keys.sql`
- Modify: `migrations/meta/_journal.json` (auto-updated by drizzle-kit)

- [ ] **Step 1: Add the Drizzle table**

Append to `shared/schema.ts`:

```ts
export const bookingIdempotencyKeys = pgTable(
  "booking_idempotency_keys",
  {
    hospitalId: uuid("hospital_id").notNull(),
    key: text("key").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    requestHash: text("request_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.hospitalId, table.key] }),
    createdAtIdx: index("booking_idempotency_keys_created_at_idx").on(
      table.createdAt,
    ),
  }),
);
```

Verify `uuid`, `text`, `timestamp`, `pgTable`, `primaryKey`, `index` are already imported at the top of `shared/schema.ts` — add any missing imports.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `migrations/NNNN_<name>.sql` is created plus an entry in `migrations/meta/_journal.json`. Note the filename.

- [ ] **Step 3: Rewrite the generated migration idempotently**

Open the generated SQL file and replace its contents with:

```sql
CREATE TABLE IF NOT EXISTS "booking_idempotency_keys" (
	"hospital_id" uuid NOT NULL,
	"key" text NOT NULL,
	"appointment_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_idempotency_keys_hospital_id_key_pk" PRIMARY KEY("hospital_id","key")
);

CREATE INDEX IF NOT EXISTS "booking_idempotency_keys_created_at_idx"
  ON "booking_idempotency_keys" USING btree ("created_at");
```

- [ ] **Step 4: Verify journal entry + `when` ordering**

Open `migrations/meta/_journal.json` and confirm the new entry's `when` timestamp is larger than all earlier entries. Per user memory: this is load-bearing — drizzle-kit orders by `when`, not by numeric filename.

- [ ] **Step 5: Push the schema**

Run: `npx drizzle-kit push`
Expected: "Changes applied" with no pending diffs.

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat(api): booking_idempotency_keys table for POST /book idempotency"
```

---

## Task 6: Idempotency — storage helpers

**Files:**
- Create: `server/storage/bookingIdempotency.ts`

- [ ] **Step 1: Write the helpers**

Create `server/storage/bookingIdempotency.ts`:

```ts
import { and, eq, lt } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db";
import { bookingIdempotencyKeys } from "@shared/schema";

export function hashBookingRequest(body: unknown): string {
  const canonical = JSON.stringify(
    sortKeysDeep(body ?? {}),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

export async function findIdempotencyRecord(params: {
  hospitalId: string;
  key: string;
}) {
  const rows = await db
    .select()
    .from(bookingIdempotencyKeys)
    .where(
      and(
        eq(bookingIdempotencyKeys.hospitalId, params.hospitalId),
        eq(bookingIdempotencyKeys.key, params.key),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function recordIdempotencyKey(params: {
  hospitalId: string;
  key: string;
  appointmentId: string;
  requestHash: string;
}) {
  await db.insert(bookingIdempotencyKeys).values(params);
}

export async function cleanupExpiredIdempotencyKeys(
  olderThan: Date = new Date(Date.now() - 24 * 60 * 60 * 1000),
) {
  await db
    .delete(bookingIdempotencyKeys)
    .where(lt(bookingIdempotencyKeys.createdAt, olderThan));
}
```

- [ ] **Step 2: Unit-test the hash helper**

Create `tests/bookingIdempotency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashBookingRequest } from "../server/storage/bookingIdempotency";

describe("hashBookingRequest", () => {
  it("is stable for key order differences", () => {
    const a = { email: "x@y.com", firstName: "A", surname: "B" };
    const b = { surname: "B", firstName: "A", email: "x@y.com" };
    expect(hashBookingRequest(a)).toBe(hashBookingRequest(b));
  });

  it("differs when a field changes", () => {
    expect(hashBookingRequest({ x: 1 })).not.toBe(
      hashBookingRequest({ x: 2 }),
    );
  });

  it("handles nested objects + arrays", () => {
    const a = { a: [1, { y: 2, x: 1 }] };
    const b = { a: [1, { x: 1, y: 2 }] };
    expect(hashBookingRequest(a)).toBe(hashBookingRequest(b));
  });
});
```

- [ ] **Step 3: Run test, confirm it passes**

Run: `npx vitest run tests/bookingIdempotency.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add server/storage/bookingIdempotency.ts tests/bookingIdempotency.test.ts
git commit -m "feat(api): idempotency storage helpers + request-hash canonicalization"
```

---

## Task 7: Idempotency — wire into `POST /book`

**Files:**
- Modify: `server/routes/clinic.ts` (inside `POST /api/public/booking/:bookingToken/book`)
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `tests/public-docs.test.ts`:

```ts
// --- Idempotency contract (new) ---
// These tests require a test DB fixture for a hospital with a valid
// booking token and at least one bookable provider. Use the existing
// fixture used elsewhere in the test suite (search for `TEST_HOSPITAL`
// or `seedHospital` before authoring — do NOT invent a new one).

describe("POST /api/public/booking/:token/book — idempotency", () => {
  // Skip if no fixture available — wire to real fixture in step 2 if one exists,
  // otherwise mark this test `.skip` and leave a TODO comment to pick up once
  // a fixture exists. Do NOT write a fake storage mock — idempotency must run
  // against real SQL.
  it.todo(
    "same Idempotency-Key + same body → single appointment, replayed response",
  );
  it.todo(
    "same Idempotency-Key + different body → 409 IDEMPOTENCY_CONFLICT",
  );
});
```

Before marking `it.todo`, search the repo:

```bash
grep -rn "bookingToken.*test\|seedHospital\|TEST_BOOKING_TOKEN" tests/ server/__tests__/ 2>/dev/null | head
```

If a fixture exists, **replace the `it.todo` stubs with real implementations** (two POSTs via supertest, same + different body, asserting the appointment count and response shape). If no fixture exists, leave them as `it.todo` — they serve as a documented contract to backfill.

- [ ] **Step 2: Modify the POST /book handler**

In `server/routes/clinic.ts`, at the top of the `POST /api/public/booking/:bookingToken/book` handler (line ~765), just after the `if (!hospital)` check and before `bookingSchema.safeParse`, add:

```ts
import {
  findIdempotencyRecord,
  recordIdempotencyKey,
  hashBookingRequest,
} from "../storage/bookingIdempotency";
```
(add near the other imports at the top of `clinic.ts`)

Then inside the handler:

```ts
const idempotencyKey = req.header("Idempotency-Key")?.trim();
const requestHash = idempotencyKey
  ? hashBookingRequest(req.body)
  : null;

if (idempotencyKey && requestHash) {
  const existing = await findIdempotencyRecord({
    hospitalId: hospital.id,
    key: idempotencyKey,
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return sendPublicApiError(res, "IDEMPOTENCY_CONFLICT");
    }
    const appointment = await storage.getClinicAppointment(
      existing.appointmentId,
    );
    if (appointment) {
      res.setHeader("X-Idempotent-Replay", "true");
      return res.status(200).json({ appointment });
    }
    // Record exists but appointment was deleted — fall through and re-create.
  }
}
```

After the appointment is successfully created (around the current success `res.json({ appointment })` at the bottom of the handler), **before** sending the response, add:

```ts
if (idempotencyKey && requestHash) {
  try {
    await recordIdempotencyKey({
      hospitalId: hospital.id,
      key: idempotencyKey,
      appointmentId: appointment.id,
      requestHash,
    });
  } catch (err) {
    // Unique-violation race: another request won. Look up and replay.
    const existing = await findIdempotencyRecord({
      hospitalId: hospital.id,
      key: idempotencyKey,
    });
    if (existing) {
      const replay = await storage.getClinicAppointment(
        existing.appointmentId,
      );
      if (replay) {
        res.setHeader("X-Idempotent-Replay", "true");
        return res.status(200).json({ appointment: replay });
      }
    }
  }
}
```

Verify `storage.getClinicAppointment(appointmentId)` exists. Search:

```bash
grep -n "getClinicAppointment" server/storage/*.ts server/storage.ts 2>/dev/null
```

If it doesn't exist, add the simplest possible implementation in `server/storage.ts` returning a single appointment by id, or rename the call to match whatever lookup function does exist.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/public-docs.test.ts tests/bookingIdempotency.test.ts`
Expected: previously-passing tests still pass; any real (non-`.todo`) idempotency tests pass.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add server/routes/clinic.ts tests/public-docs.test.ts server/storage.ts
git commit -m "feat(api): Idempotency-Key support on POST /book"
```

---

## Task 8: Idempotency cleanup cron

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Locate the existing cleanup cron (if any)**

```bash
grep -rn "cleanupExpired\|setInterval\|cron\." server/ | head
```

The project already has `cleanupExpiredPortalData` called on an interval — check how it's wired and follow the same pattern.

- [ ] **Step 2: Add the cleanup call**

In `server/index.ts`, wherever `cleanupExpiredPortalData` is invoked (grep for it), add an adjacent call:

```ts
import { cleanupExpiredIdempotencyKeys } from "./storage/bookingIdempotency";

// Run the idempotency-key cleanup every 6 hours.
setInterval(
  () => {
    cleanupExpiredIdempotencyKeys().catch((err) =>
      logger.error("[booking-idempotency] cleanup failed", err),
    );
  },
  6 * 60 * 60 * 1000,
);
```

If there's a unified "schedulers" section, put it there instead. Follow what the file already does.

- [ ] **Step 3: Boot the server, confirm no crash**

Run: `npm run dev` (let it start), then Ctrl-C after it reports "listening".
Expected: normal startup log; no errors from the cleanup import.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat(api): schedule booking-idempotency cleanup every 6h"
```

---

## Task 9: Raise booking rate limit + catalog-shaped 429

**Files:**
- Modify: `server/index.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/public-docs.test.ts`:

```ts
describe("POST /api/public/booking/:token/book — rate limit", () => {
  it("returns { code: 'RATE_LIMITED', message } after the cap", async () => {
    const app = await import("../server/index").then((m) => m.default ?? m);

    // Fire 31 requests from the same IP against an invalid token.
    // The limiter intercepts before the handler runs, so the token doesn't
    // need to resolve to a real hospital.
    let last: request.Response | undefined;
    for (let i = 0; i < 31; i++) {
      last = await request(app)
        .post("/api/public/booking/any-token/book")
        .set("X-Forwarded-For", "203.0.113.10")
        .send({});
    }
    expect(last?.status).toBe(429);
    expect(last?.body.code).toBe("RATE_LIMITED");
    expect(typeof last?.body.message).toBe("string");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npx vitest run tests/public-docs.test.ts -t "rate limit"`
Expected: FAIL — current limiter is 10/15min and returns `{ message: 'Zu viele …' }`.

- [ ] **Step 3: Raise the limit + reshape the handler**

In `server/index.ts`, replace the existing `bookingSubmitLimiter` block (the one at lines 96–103) with:

```ts
import { sendPublicApiError } from "./lib/publicApiErrors";

const bookingSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendPublicApiError(res, "RATE_LIMITED");
  },
});
app.use("/api/public/booking/:token/book", bookingSubmitLimiter);
```

Also remove the German `message` property — the `handler` option replaces it.

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run tests/public-docs.test.ts -t "rate limit"`
Expected: PASS.

Rate-limit tests are slow (31 HTTP calls). If this consistently takes >10s, mark the test with `it.concurrent`-incompatible + bump its timeout: `it(..., { timeout: 15000 }, …)`.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts tests/public-docs.test.ts
git commit -m "feat(api): raise POST /book limit 10→30, return RATE_LIMITED code"
```

---

## Task 10: OpenAPI spec + JSON/YAML endpoints

**Files:**
- Create: `server/routes/publicOpenApi.ts`
- Modify: `server/routes/index.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Author the OpenAPI spec**

Create `server/routes/publicOpenApi.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { dump as yamlDump } from "js-yaml";

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Viali Booking API",
    version: "1.0.0",
    description:
      "Public booking endpoints for Viali clinics. Agents and automation tools can use these to create appointments on behalf of patients. See /api.md for human-readable docs.",
  },
  servers: [
    { url: "{host}", variables: { host: { default: "https://use.viali.app" } } },
  ],
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            enum: [
              "SLOT_TAKEN",
              "INVALID_BOOKING_DATA",
              "REFERRAL_REQUIRED",
              "NOSHOW_FEE_ACK_REQUIRED",
              "PROVIDER_NOT_BOOKABLE",
              "HOSPITAL_NOT_FOUND",
              "PROMO_INVALID",
              "CANCELLATION_DISABLED",
              "RATE_LIMITED",
              "IDEMPOTENCY_CONFLICT",
            ],
          },
          message: { type: "string" },
          fieldErrors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      BookingRequest: {
        type: "object",
        required: [
          "providerId",
          "date",
          "startTime",
          "endTime",
          "firstName",
          "surname",
          "email",
          "phone",
        ],
        properties: {
          providerId: { type: "string", format: "uuid" },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          firstName: { type: "string", maxLength: 100 },
          surname: { type: "string", maxLength: 100 },
          email: { type: "string", format: "email", maxLength: 255 },
          phone: { type: "string", maxLength: 30 },
          notes: { type: "string", maxLength: 1000 },
        },
      },
    },
  },
  paths: {
    "/api/public/booking/{token}": {
      get: {
        summary: "Hospital info + bookable providers",
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "404": {
            description: "Booking page not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/public/booking/{token}/services": {
      get: { summary: "Service list", parameters: [tokenParam()] },
    },
    "/api/public/booking/{token}/closures": {
      get: { summary: "Blocked dates", parameters: [tokenParam()] },
    },
    "/api/public/booking/{token}/providers/{providerId}/available-dates": {
      get: {
        summary: "Dates with available slots in a range",
        parameters: [tokenParam(), providerIdParam()],
      },
    },
    "/api/public/booking/{token}/providers/{providerId}/slots": {
      get: {
        summary: "Slots on a specific date",
        parameters: [
          tokenParam(),
          providerIdParam(),
          { name: "date", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
        ],
      },
    },
    "/api/public/booking/{token}/best-provider": {
      get: { summary: "Next-available provider heuristic", parameters: [tokenParam()] },
    },
    "/api/public/booking/{token}/prefill": {
      get: {
        summary: "Prefill patient data from a short-lived token",
        parameters: [
          tokenParam(),
          { name: "token", in: "query", required: true, schema: { type: "string" } },
        ],
      },
    },
    "/api/public/booking/{token}/promo/{code}": {
      get: {
        summary: "Validate a promo code",
        parameters: [
          tokenParam(),
          { name: "code", in: "path", required: true, schema: { type: "string" } },
        ],
      },
    },
    "/api/public/booking/{token}/book": {
      post: {
        summary: "Create an appointment",
        parameters: [
          tokenParam(),
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            description:
              "Optional. If provided, replaying the same request within 24h returns the original appointment (status 200, header X-Idempotent-Replay: true). Replaying the same key with a different body returns 409 IDEMPOTENCY_CONFLICT.",
            schema: { type: "string", maxLength: 200 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BookingRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Replayed existing appointment (idempotent)" },
          "201": { description: "Created" },
          "400": errorRef(),
          "404": errorRef(),
          "409": errorRef(),
          "429": errorRef(),
        },
        "x-rateLimit": { window: "15m", max: 30, scope: "per-IP" },
      },
    },
    "/api/clinic/appointments/cancel-info/{token}": {
      get: {
        summary: "Fetch appointment details for a cancellation token",
        description:
          "Given a single-use action token (delivered to the patient via email/SMS), returns the appointment details including noShowFeeMessage and hidePatientCancel. Agents MUST fetch this before posting to /cancel-by-token so they can surface the fee notice to the user.",
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Appointment details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    appointmentDate: { type: "string" },
                    appointmentTime: { type: "string" },
                    clinicName: { type: "string" },
                    noShowFeeMessage: {
                      type: ["string", "null"],
                      description:
                        "Non-empty when the clinic charges a no-show fee. Agents must show this to the user before cancellation.",
                    },
                    hidePatientCancel: {
                      type: "boolean",
                      description:
                        "If true, cancel-by-token will return 403 CANCELLATION_DISABLED.",
                    },
                  },
                },
              },
            },
          },
          "404": {
            description: "Token not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "410": {
            description: "Token already used or expired",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    alreadyUsed: { type: "boolean" },
                    expired: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/clinic/appointments/cancel-by-token": {
      post: {
        summary: "Cancel an appointment using a patient's action token",
        description:
          "Cancels a scheduled or confirmed appointment. The token is single-use and delivered to the patient via email or SMS. Returns 403 CANCELLATION_DISABLED when the hospital has hidePatientCancel = true.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: { type: "string" },
                  reason: { type: "string", maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Cancelled" },
          "403": errorRef(),
          "404": { description: "Token not found" },
          "409": { description: "Appointment cannot be cancelled (bad status)" },
          "410": { description: "Token already used or expired" },
        },
      },
    },
  },
};

function tokenParam() {
  return {
    name: "token",
    in: "path",
    required: true,
    schema: { type: "string" },
  };
}
function providerIdParam() {
  return {
    name: "providerId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
}
function errorRef() {
  return {
    description: "Error",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  };
}

export function openApiJsonHandler(_req: Request, res: Response) {
  res.type("application/json").send(JSON.stringify(OPENAPI_SPEC, null, 2));
}
export function openApiYamlHandler(_req: Request, res: Response) {
  res.type("application/yaml").send(yamlDump(OPENAPI_SPEC));
}
export function wellKnownOpenApiRedirect(_req: Request, res: Response) {
  res.redirect(302, "/api/openapi.json");
}

const router = Router();
router.get("/api/openapi.json", openApiJsonHandler);
router.get("/api/openapi.yaml", openApiYamlHandler);
router.get("/.well-known/openapi.json", wellKnownOpenApiRedirect);
export default router;
```

- [ ] **Step 2: Register the router**

In `server/routes/index.ts`, find where `publicDocs` router is registered and add the OpenAPI router alongside:

```ts
import publicOpenApi from "./publicOpenApi";
// …
app.use(publicOpenApi);
```

(Grep `publicDocs` in `server/routes/index.ts` to find the exact line — follow the pattern already there.)

- [ ] **Step 3: Write the test**

Append to `tests/public-docs.test.ts`:

```ts
import publicOpenApiRouter from "../server/routes/publicOpenApi";

describe("/api/openapi.json", () => {
  function buildApp() {
    const app = express();
    app.use(publicOpenApiRouter);
    return app;
  }

  it("returns valid OpenAPI 3.1 JSON with all 11 documented paths", async () => {
    const res = await request(buildApp()).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const spec = JSON.parse(res.text);
    expect(spec.openapi).toBe("3.1.0");
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/api/public/booking/{token}");
    expect(paths).toContain("/api/public/booking/{token}/services");
    expect(paths).toContain("/api/public/booking/{token}/closures");
    expect(paths).toContain(
      "/api/public/booking/{token}/providers/{providerId}/available-dates",
    );
    expect(paths).toContain(
      "/api/public/booking/{token}/providers/{providerId}/slots",
    );
    expect(paths).toContain("/api/public/booking/{token}/best-provider");
    expect(paths).toContain("/api/public/booking/{token}/prefill");
    expect(paths).toContain("/api/public/booking/{token}/promo/{code}");
    expect(paths).toContain("/api/public/booking/{token}/book");
    expect(paths).toContain("/api/clinic/appointments/cancel-info/{token}");
    expect(paths).toContain("/api/clinic/appointments/cancel-by-token");
  });

  it("declares all 10 error codes in the Error schema enum", async () => {
    const res = await request(buildApp()).get("/api/openapi.json");
    const spec = JSON.parse(res.text);
    expect(spec.components.schemas.Error.properties.code.enum.sort()).toEqual(
      [
        "CANCELLATION_DISABLED",
        "HOSPITAL_NOT_FOUND",
        "IDEMPOTENCY_CONFLICT",
        "INVALID_BOOKING_DATA",
        "NOSHOW_FEE_ACK_REQUIRED",
        "PROMO_INVALID",
        "PROVIDER_NOT_BOOKABLE",
        "RATE_LIMITED",
        "REFERRAL_REQUIRED",
        "SLOT_TAKEN",
      ].sort(),
    );
  });
});

describe("/api/openapi.yaml", () => {
  it("serves valid YAML", async () => {
    const app = express();
    app.use(publicOpenApiRouter);
    const res = await request(app).get("/api/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/yaml/);
    expect(res.text).toMatch(/openapi: 3\.1\.0/);
  });
});

describe("/.well-known/openapi.json", () => {
  it("redirects to /api/openapi.json", async () => {
    const app = express();
    app.use(publicOpenApiRouter);
    const res = await request(app).get("/.well-known/openapi.json");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/api/openapi.json");
  });
});
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run tests/public-docs.test.ts`
Expected: all pass.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add server/routes/publicOpenApi.ts server/routes/index.ts tests/public-docs.test.ts
git commit -m "feat(api): serve OpenAPI 3.1 at /api/openapi.{json,yaml} + .well-known redirect"
```

---

## Task 11: Extend `PUBLIC_API_MD` with Booking API (JSON) section

**Files:**
- Modify: `server/routes/publicDocs.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Draft the new Markdown section**

In `server/routes/publicDocs.ts`, **immediately after** the existing `### Example` subsection of `## Booking link (/book)` (line ~96 of the template — search for the line before `## Leads Webhook`), insert this block:

````ts
## Booking API (JSON)

For agents, backends, and automation tools that want to create an appointment
*without* rendering the \`/book\` HTML page, Viali exposes 9 JSON endpoints
under \`/api/public/booking/:token/*\`. The booking token in the URL
identifies the hospital — no API key is required.

> A machine-readable OpenAPI 3.1 schema is served at \`/api/openapi.json\`
> (YAML at \`/api/openapi.yaml\`). AI agents: that is the fastest path to
> a working client.

### Happy-path flow

1. \`GET /api/public/booking/<TOKEN>/services\` — list services
2. \`GET /api/public/booking/<TOKEN>/providers/<PROVIDER_ID>/slots?date=YYYY-MM-DD\` — list slots on a date
3. \`POST /api/public/booking/<TOKEN>/book\` — create the appointment

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | \`/api/public/booking/:token\` | Hospital + providers |
| GET | \`/api/public/booking/:token/services\` | Service list |
| GET | \`/api/public/booking/:token/closures\` | Blocked dates |
| GET | \`/api/public/booking/:token/providers/:providerId/available-dates\` | Dates with slots in a range |
| GET | \`/api/public/booking/:token/providers/:providerId/slots?date=YYYY-MM-DD\` | Slots on a given date |
| GET | \`/api/public/booking/:token/best-provider?service=<code>&date=YYYY-MM-DD\` | Next-available heuristic |
| GET | \`/api/public/booking/:token/prefill?token=<prefill-token>\` | Prefill from short-lived token |
| GET | \`/api/public/booking/:token/promo/:code\` | Validate a promo code |
| POST | \`/api/public/booking/:token/book\` | Create appointment |

### Creating a booking

\`\`\`bash
curl -X POST https://<your-viali-host>/api/public/booking/<TOKEN>/book \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 8f2c1e9a-bf6d-4c2a-9a1e-91b9c5d1e3a4" \\
  -d '{
    "providerId": "a1b2c3d4-…",
    "date": "2026-05-12",
    "startTime": "10:00",
    "endTime": "10:30",
    "firstName": "Maria",
    "surname": "Müller",
    "email": "maria@example.com",
    "phone": "+41791234567"
  }'
\`\`\`

### Idempotency

Send an \`Idempotency-Key\` header (any unique string, ≤ 200 chars — a v4 UUID
is a safe default) to make the booking retriable:

- Same key + same body within 24h → returns the original appointment with status
  \`200\` and header \`X-Idempotent-Replay: true\`.
- Same key + different body → returns \`409\` with \`code: "IDEMPOTENCY_CONFLICT"\`.

### No-show fee acknowledgement

If \`GET /api/public/booking/:token\` returns a non-null \`noShowFeeMessage\`,
agents **must** surface that message to the user before booking and then
include \`noShowFeeAcknowledged: true\` in the \`POST /book\` body. Omitting
it returns \`400 NOSHOW_FEE_ACK_REQUIRED\`.

### Cancelling an appointment

Two endpoints, both under \`/api/clinic/appointments/\`. These accept the
single-use action token delivered to the patient by email/SMS after
booking. An agent with access to the patient's inbox has this token.

\`\`\`bash
# 1) Inspect the appointment + any fee notice BEFORE cancelling.
curl https://<your-viali-host>/api/clinic/appointments/cancel-info/<TOKEN>

# 2) Once the user has acknowledged any fee, cancel.
curl -X POST https://<your-viali-host>/api/clinic/appointments/cancel-by-token \\
  -H "Content-Type: application/json" \\
  -d '{ "token": "<TOKEN>", "reason": "patient requested" }'
\`\`\`

Agents **must** fetch \`cancel-info\` first and relay \`noShowFeeMessage\` to the
user — the clinic may charge a fee for late cancellations.

If the clinic has \`hidePatientCancel\` set, \`cancel-by-token\` returns
\`403 CANCELLATION_DISABLED\`. \`cancel-info\` returns \`hidePatientCancel: true\`
in the body so agents can surface this before attempting the cancel.

### Error responses

Every error response under \`/api/public/booking/*\` and the \`/api/clinic/appointments/cancel-*\` endpoints returns:

\`\`\`json
{ "code": "SLOT_TAKEN", "message": "The selected slot is no longer available." }
\`\`\`

Stable codes:

| Code | HTTP | When |
|---|---|---|
| \`SLOT_TAKEN\` | 409 | Slot was taken between availability query and book |
| \`INVALID_BOOKING_DATA\` | 400 | Body failed schema validation; response also contains \`fieldErrors\` |
| \`REFERRAL_REQUIRED\` | 400 | Hospital requires UTM / referral source |
| \`NOSHOW_FEE_ACK_REQUIRED\` | 400 | Clinic has a no-show fee notice; \`noShowFeeAcknowledged: true\` missing from payload |
| \`PROVIDER_NOT_BOOKABLE\` | 404 | Provider not public / not bookable |
| \`HOSPITAL_NOT_FOUND\` | 404 | Booking token invalid or disabled |
| \`PROMO_INVALID\` | 404 | Promo code unknown or expired |
| \`CANCELLATION_DISABLED\` | 403 | Clinic has \`hidePatientCancel\` enabled |
| \`RATE_LIMITED\` | 429 | Rate limiter tripped |
| \`IDEMPOTENCY_CONFLICT\` | 409 | Same \`Idempotency-Key\` with a different body |

Note: the cancellation endpoints also return a small set of non-catalog state-transition shapes (\`{ message, alreadyUsed: true }\` on 410, \`{ message, status }\` on 409) that predate the catalog and are kept for backwards compatibility with the existing SPA.

### Rate limits

- Reads (\`GET /api/public/booking/*\`): 300 req/min/IP (shared with the rest of the API)
- Booking submissions (\`POST /book\`): 30 per 15 min per IP
- Responses include standard \`RateLimit-*\` headers

### CORS

All \`/api/public/booking/*\` responses include \`Access-Control-Allow-Origin: *\`.
Browser-based agents and site chatbots can call these endpoints directly.

---
````

- [ ] **Step 2: Add a parity test**

Append to `tests/public-docs.test.ts`:

```ts
describe("/api.md — Booking API (JSON) parity", () => {
  it("documents all 9 booking JSON endpoints", async () => {
    const res = await request(buildApp()).get("/api.md");
    for (const suffix of [
      "/api/public/booking/:token",
      "/services",
      "/closures",
      "/available-dates",
      "/slots",
      "/best-provider",
      "/prefill",
      "/promo/:code",
      "/book",
    ]) {
      expect(res.text).toContain(suffix);
    }
  });

  it("documents all 10 error codes", async () => {
    const res = await request(buildApp()).get("/api.md");
    for (const code of [
      "SLOT_TAKEN",
      "INVALID_BOOKING_DATA",
      "REFERRAL_REQUIRED",
      "NOSHOW_FEE_ACK_REQUIRED",
      "PROVIDER_NOT_BOOKABLE",
      "HOSPITAL_NOT_FOUND",
      "PROMO_INVALID",
      "CANCELLATION_DISABLED",
      "RATE_LIMITED",
      "IDEMPOTENCY_CONFLICT",
    ]) {
      expect(res.text).toContain(code);
    }
  });

  it("documents cancel-info + cancel-by-token endpoints", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("/api/clinic/appointments/cancel-info/");
    expect(res.text).toContain("/api/clinic/appointments/cancel-by-token");
    expect(res.text).toMatch(/no-show/i);
  });

  it("mentions Idempotency-Key header", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("Idempotency-Key");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/public-docs.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add server/routes/publicDocs.ts tests/public-docs.test.ts
git commit -m "docs(api): add Booking API (JSON) section to PUBLIC_API_MD"
```

---

## Task 12: Update `LLMS_TXT` to index both docs

**Files:**
- Modify: `server/routes/publicDocs.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Rewrite `LLMS_TXT`**

In `server/routes/publicDocs.ts`, replace the current `LLMS_TXT` template (lines ~267–284) with:

```ts
export const LLMS_TXT = `# Viali API

> Viali's public API for booking links, lead ingestion, and
> ad-platform conversion reporting.

## Docs

- /api.md — Full API reference, markdown (human + agent)
- /api/openapi.json — OpenAPI 3.1 schema (machine-readable)
- /api/openapi.yaml — Same, YAML
- /api — Rendered HTML version of /api.md

## Booking API quick-start

1. GET  /api/public/booking/{token}/services
2. GET  /api/public/booking/{token}/providers/{providerId}/slots?date=YYYY-MM-DD
3. POST /api/public/booking/{token}/book  (Idempotency-Key header recommended)

## Other public endpoints

- Booking link: /book/{token} — see /api.md#booking-link-book
- Leads webhook: see /api.md#leads-webhook
- Conversions API: see /api.md#conversions-api

## Auth

Per-hospital API keys for admin / webhook endpoints, generated by a
hospital admin at /admin/integrations (tab: API Key). Passed as ?key=
query param. The public booking API does NOT require an API key — the
booking token in the URL identifies the hospital.
`;
```

- [ ] **Step 2: Extend the existing `/llms.txt` test**

In `tests/public-docs.test.ts`, add these assertions inside the existing `describe("/llms.txt")`:

```ts
it("references the OpenAPI schema", async () => {
  const res = await request(buildApp()).get("/llms.txt");
  expect(res.text).toContain("/api/openapi.json");
});

it("includes the booking API quick-start", async () => {
  const res = await request(buildApp()).get("/llms.txt");
  expect(res.text).toMatch(/quick-start/i);
  expect(res.text).toContain("/api/public/booking");
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/public-docs.test.ts -t "llms.txt"`
Expected: all pass — including the original `references all three public endpoint areas` (leads / conversions / book), which still holds.

- [ ] **Step 4: Commit**

```bash
git add server/routes/publicDocs.ts tests/public-docs.test.ts
git commit -m "docs(api): LLMS_TXT indexes /api/openapi.json + booking quick-start"
```

---

## Task 13: Admin UI — "Share with AI agents" dialog

**Files:**
- Modify: `client/src/pages/admin/components/BookingTokenSection.tsx`
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`
- Create: `client/src/pages/admin/components/BookingTokenSection.test.tsx` (if the project has co-located component tests; otherwise place under `tests/`)

i18n: project uses DE + EN only (not 5 languages as the spec earlier said — the spec's language count was wrong; this plan is the correct source of truth).

- [ ] **Step 1: Locate the i18n keys pattern**

```bash
grep -n "\"booking\":" client/src/i18n/locales/en.json | head
```
Identify where the "booking" / "admin" namespace sits in the locale file so keys are added consistently.

- [ ] **Step 2: Add i18n keys**

In `client/src/i18n/locales/en.json`, add under the admin / booking section (follow whatever nesting the file already uses):

```json
"bookingTokenSection": {
  "shareWithAgents": {
    "button": "Share with AI agents",
    "title": "Share with AI agents",
    "description": "Copy this prompt into your website builder (Replit, Lovable, v0, Bolt, etc.) to let AI agents like Claude, ChatGPT and personal assistants book appointments on behalf of patients visiting your website.",
    "copy": "Copy prompt",
    "copied": "Copied!",
    "learnMore": "Learn more"
  }
}
```

In `client/src/i18n/locales/de.json`, the German equivalents:

```json
"bookingTokenSection": {
  "shareWithAgents": {
    "button": "Für KI-Agenten teilen",
    "title": "Für KI-Agenten teilen",
    "description": "Kopiere diesen Prompt in deinen Website-Builder (Replit, Lovable, v0, Bolt etc.), damit KI-Agenten wie Claude, ChatGPT oder persönliche Assistenten Termine für Patienten auf deiner Website buchen können.",
    "copy": "Prompt kopieren",
    "copied": "Kopiert!",
    "learnMore": "Mehr erfahren"
  }
}
```

If the project's existing keys are flat (e.g. `"admin.booking.shareWithAgents.button"`) instead of nested objects, follow that convention — match whatever pattern the rest of `BookingTokenSection.tsx` uses (`t("…")` calls).

- [ ] **Step 3: Add the dialog to the component**

In `client/src/pages/admin/components/BookingTokenSection.tsx`:

- Import `Bot` (or `Sparkles`) from `lucide-react` and the project's `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogTrigger` from `@/components/ui/dialog`.
- Add a state:
  ```ts
  const [promptCopied, setPromptCopied] = useState(false);
  ```
- Build the prompt constant inside the component (so it can interpolate `baseUrl` and `tokenData.bookingToken`):
  ```ts
  const agentPrompt = tokenData?.bookingToken ? `Make our booking flow discoverable to AI agents (Claude, ChatGPT,
  naturaumana.ai, etc.) so they can book appointments on our behalf.

  Our booking is hosted on Viali at:
    ${baseUrl}/book/${tokenData.bookingToken}

  Viali already exposes an agent-ready API. We just need to advertise it.
  Do these four things:

  1) Create /public/llms.txt with:
     # Our Clinic — Agent Index
     # Appointment booking is provided by Viali.

     Booking docs:    ${baseUrl}/api.md
     OpenAPI schema:  ${baseUrl}/api/openapi.json
     Booking endpoint base:
       ${baseUrl}/api/public/booking/${tokenData.bookingToken}/

     Quick start:
       1. GET  /services
       2. GET  /providers/{id}/slots?date=YYYY-MM-DD
       3. POST /book  (send Idempotency-Key header)

  2) In the HTML <head> of every page, add:
     <link rel="alternate" type="application/json"
           href="${baseUrl}/api/openapi.json"
           title="Booking API (OpenAPI)">
     <link rel="alternate" type="text/markdown"
           href="${baseUrl}/api.md"
           title="Booking API docs">

  3) In the site footer, add a small link:
     <a href="${baseUrl}/api">API for agents</a>

  4) Make sure robots.txt does NOT block /llms.txt or GPTBot/ClaudeBot/
     PerplexityBot/Google-Extended — we WANT agents to crawl this.

  Commit as: "feat: advertise Viali booking API for AI agents".
  ` : "";
  ```
- Add a copy handler:
  ```ts
  const handleCopyPrompt = async () => {
    if (!agentPrompt) return;
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch { /* ignore */ }
  };
  ```
- In the JSX, on the button row that already contains **Regenerate Link** and **Disable Link** (the `flex items-center gap-2 flex-wrap` div), add a third button that opens the dialog:
  ```tsx
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm">
        <Bot className="h-4 w-4 mr-2" />
        {t("bookingTokenSection.shareWithAgents.button")}
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("bookingTokenSection.shareWithAgents.title")}</DialogTitle>
        <DialogDescription>
          {t("bookingTokenSection.shareWithAgents.description")}
        </DialogDescription>
      </DialogHeader>
      <pre className="text-xs bg-muted p-3 rounded-md max-h-96 overflow-auto whitespace-pre-wrap">
        {agentPrompt}
      </pre>
      <DialogFooter className="gap-2 sm:gap-2">
        <a
          href={`${baseUrl}/api`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground underline self-center mr-auto"
        >
          {t("bookingTokenSection.shareWithAgents.learnMore")}
        </a>
        <Button onClick={handleCopyPrompt} size="sm">
          {promptCopied ? (
            <><Check className="h-4 w-4 mr-2" /> {t("bookingTokenSection.shareWithAgents.copied")}</>
          ) : (
            <><Copy className="h-4 w-4 mr-2" /> {t("bookingTokenSection.shareWithAgents.copy")}</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  ```
  Place it after the `Disable Link` button so the order is: Regenerate → Disable → Share with AI agents.

- [ ] **Step 4: Smoke-test the component renders**

This project's test setup for React components — check with:

```bash
grep -rn "vitest\|@testing-library/react" package.json client/src 2>/dev/null | head -5
```

If a React-testing setup exists, write a minimal render test that:
- Mounts `BookingTokenSection` with a mocked `useQuery` that returns `{ bookingToken: "test-token-abc" }`
- Clicks the `Share with AI agents` button
- Asserts the dialog renders the prompt string containing `test-token-abc`

If the project does not have `@testing-library/react` wired up, skip the component test and instead manually verify in `npm run dev` (load `/admin → Booking`, click the button, confirm the prompt has the real booking URL + token substituted, click Copy, paste into another buffer to confirm).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
Navigate to `/admin → Booking → Patient Booking Page`. Click **Share with AI agents**. Confirm:
- Dialog opens
- Prompt contains `http://localhost:<port>` as `baseUrl` and the actual booking token
- Copy button works and shows "Copied!" feedback
- "Learn more" opens `/api` in a new tab

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/admin/components/BookingTokenSection.tsx client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "feat(admin): Share with AI agents dialog in BookingTokenSection"
```

---

## Task 14: Static MCP Server Card at `/.well-known/mcp*`

**Why:** The MCP ecosystem (Model Context Protocol, Anthropic) is standardizing on `/.well-known/mcp.json` as a static discovery manifest that advertises server capabilities + tools *before* a client opens a full MCP connection. A static card doesn't require running an MCP JSON-RPC server — it's metadata pointing at our existing HTTP API. Scorer `isitagentready.com` probes three paths: `/.well-known/mcp.json`, `/.well-known/mcp/server-card.json`, `/.well-known/mcp/server-cards.json`. We serve the same content at all three.

**Files:**
- Create: `server/routes/publicMcpCard.ts`
- Modify: `server/routes/index.ts`
- Modify: `tests/public-docs.test.ts`

- [ ] **Step 1: Author the card**

Create `server/routes/publicMcpCard.ts`:

```ts
import { Router, type Request, type Response } from "express";

export const MCP_SERVER_CARD = {
  $schema: "https://modelcontextprotocol.io/schema/server-card/draft",
  name: "viali-booking",
  title: "Viali Booking",
  version: "1.0.0",
  description:
    "Appointment booking for a Viali-powered clinic. Agents can list services, find available slots, and create appointments on behalf of patients.",
  vendor: {
    name: "Viali",
    url: "https://use.viali.app",
  },
  documentation: {
    openapi: "/api/openapi.json",
    markdown: "/api.md",
    human: "/api",
  },
  capabilities: {
    tools: { listChanged: false },
  },
  authentication: {
    type: "none",
    note:
      "The hospital's booking token is part of every endpoint URL; no bearer token, API key, or OAuth flow is required.",
  },
  tools: [
    {
      name: "list_services",
      title: "List services",
      description:
        "List all services bookable at this clinic (e.g. consultations, procedures). Returns codes, names, durations, and optional service groups.",
      inputSchema: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description:
              "The clinic's public booking token (from the /book/<token> URL).",
          },
        },
        required: ["token"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/services",
        },
      },
    },
    {
      name: "list_providers",
      title: "List bookable providers",
      description:
        "List all providers (doctors, surgeons, practitioners) who accept public bookings at this clinic.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Hospital booking token." },
        },
        required: ["token"],
      },
      _meta: {
        http: { method: "GET", path: "/api/public/booking/{token}" },
      },
    },
    {
      name: "list_available_dates",
      title: "List available dates",
      description:
        "List dates in a range on which a provider has at least one bookable slot.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          providerId: {
            type: "string",
            format: "uuid",
            description: "The provider's ID (from list_providers).",
          },
        },
        required: ["token", "providerId"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/providers/{providerId}/available-dates",
        },
      },
    },
    {
      name: "list_slots",
      title: "List time slots",
      description:
        "List the bookable time slots for a provider on a specific date.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          providerId: { type: "string", format: "uuid" },
          date: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            description: "Date in YYYY-MM-DD format.",
          },
        },
        required: ["token", "providerId", "date"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/providers/{providerId}/slots",
          queryParams: ["date"],
        },
      },
    },
    {
      name: "get_best_provider",
      title: "Find the next-available provider",
      description:
        "Given a service and a target date, find the provider with the nearest available slot.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          service: { type: "string", description: "Service code." },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
        required: ["token", "service", "date"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/best-provider",
          queryParams: ["service", "date"],
        },
      },
    },
    {
      name: "book_appointment",
      title: "Book an appointment",
      description:
        "Create an appointment for a patient. Supports retries via the Idempotency-Key header: same key + same body within 24h returns the original appointment (status 200); same key + different body returns 409 IDEMPOTENCY_CONFLICT.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          providerId: { type: "string", format: "uuid" },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          firstName: { type: "string", maxLength: 100 },
          surname: { type: "string", maxLength: 100 },
          email: { type: "string", format: "email", maxLength: 255 },
          phone: { type: "string", maxLength: 30 },
          notes: { type: "string", maxLength: 1000 },
        },
        required: [
          "token",
          "providerId",
          "date",
          "startTime",
          "endTime",
          "firstName",
          "surname",
          "email",
          "phone",
        ],
      },
      _meta: {
        http: {
          method: "POST",
          path: "/api/public/booking/{token}/book",
          headers: {
            "Idempotency-Key": {
              required: false,
              description:
                "Optional UUID-like string to make the booking safely retriable.",
            },
          },
        },
      },
    },
    {
      name: "validate_promo",
      title: "Validate a promo code",
      description:
        "Check whether a promo code is currently valid at this clinic and retrieve its discount metadata.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string" },
          code: { type: "string" },
        },
        required: ["token", "code"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/public/booking/{token}/promo/{code}",
        },
      },
    },
    {
      name: "get_cancel_info",
      title: "Get cancellation info for an appointment",
      description:
        "Fetch an appointment's details using the single-use action token the patient received via email/SMS. Returns noShowFeeMessage and hidePatientCancel flags. Agents MUST call this before cancel_appointment and relay any no-show fee notice to the user.",
      inputSchema: {
        type: "object",
        properties: {
          actionToken: {
            type: "string",
            description:
              "The appointment action token from the patient's cancel link (email/SMS).",
          },
        },
        required: ["actionToken"],
      },
      _meta: {
        http: {
          method: "GET",
          path: "/api/clinic/appointments/cancel-info/{actionToken}",
        },
      },
    },
    {
      name: "cancel_appointment",
      title: "Cancel an appointment",
      description:
        "Cancel a scheduled or confirmed appointment using the patient's single-use action token. IMPORTANT: call get_cancel_info first — when noShowFeeMessage is present, show it to the user and obtain explicit confirmation before cancelling. Returns 403 CANCELLATION_DISABLED if the clinic has hidePatientCancel enabled.",
      inputSchema: {
        type: "object",
        properties: {
          actionToken: { type: "string" },
          reason: {
            type: "string",
            maxLength: 500,
            description:
              "Optional. Free-form cancellation reason — appears in the clinic's alert email.",
          },
        },
        required: ["actionToken"],
      },
      _meta: {
        http: {
          method: "POST",
          path: "/api/clinic/appointments/cancel-by-token",
          bodyShape: {
            token: "{actionToken}",
            reason: "{reason}",
          },
        },
      },
    },
  ],
} as const;

export function mcpCardHandler(_req: Request, res: Response) {
  res
    .type("application/json")
    .setHeader("Cache-Control", "public, max-age=300")
    .send(JSON.stringify(MCP_SERVER_CARD, null, 2));
}

const router = Router();
// Serve the same content at all three well-known paths agents commonly probe.
router.get("/.well-known/mcp.json", mcpCardHandler);
router.get("/.well-known/mcp/server-card.json", mcpCardHandler);
router.get("/.well-known/mcp/server-cards.json", mcpCardHandler);
export default router;
```

- [ ] **Step 2: Register the router**

In `server/routes/index.ts`, alongside `publicOpenApi`:

```ts
import publicMcpCard from "./publicMcpCard";
// …
app.use(publicMcpCard);
```

- [ ] **Step 3: Write the test**

Append to `tests/public-docs.test.ts`:

```ts
import publicMcpCardRouter from "../server/routes/publicMcpCard";

describe("/.well-known/mcp* MCP Server Card", () => {
  function buildApp() {
    const app = express();
    app.use(publicMcpCardRouter);
    return app;
  }

  it.each([
    "/.well-known/mcp.json",
    "/.well-known/mcp/server-card.json",
    "/.well-known/mcp/server-cards.json",
  ])("serves valid JSON at %s", async (path) => {
    const res = await request(buildApp()).get(path);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const card = JSON.parse(res.text);
    expect(card.name).toBe("viali-booking");
    expect(card.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(card.tools)).toBe(true);
    expect(card.tools.length).toBeGreaterThanOrEqual(6);
  });

  it("advertises the 9 agent-facing tools", async () => {
    const res = await request(buildApp()).get("/.well-known/mcp.json");
    const card = JSON.parse(res.text);
    const names = card.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(
      [
        "book_appointment",
        "cancel_appointment",
        "get_best_provider",
        "get_cancel_info",
        "list_available_dates",
        "list_providers",
        "list_services",
        "list_slots",
        "validate_promo",
      ].sort(),
    );
  });

  it("every tool has an HTTP binding that maps to /api/public/booking or /api/clinic/appointments", async () => {
    const res = await request(buildApp()).get("/.well-known/mcp.json");
    const card = JSON.parse(res.text);
    for (const tool of card.tools) {
      expect(tool._meta?.http?.method).toMatch(/^(GET|POST)$/);
      expect(tool._meta.http.path).toMatch(
        /^\/api\/(public\/booking|clinic\/appointments)\//,
      );
    }
  });

  it("cancel_appointment description warns agents to call get_cancel_info first", async () => {
    const res = await request(buildApp()).get("/.well-known/mcp.json");
    const card = JSON.parse(res.text);
    const cancelTool = card.tools.find(
      (t: { name: string }) => t.name === "cancel_appointment",
    );
    expect(cancelTool.description).toMatch(/get_cancel_info/);
    expect(cancelTool.description).toMatch(/no-show/i);
  });

  it("declares authentication.type = 'none'", async () => {
    const res = await request(buildApp()).get("/.well-known/mcp.json");
    const card = JSON.parse(res.text);
    expect(card.authentication.type).toBe("none");
  });

  it("points documentation at /api/openapi.json", async () => {
    const res = await request(buildApp()).get("/.well-known/mcp.json");
    const card = JSON.parse(res.text);
    expect(card.documentation.openapi).toBe("/api/openapi.json");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/public-docs.test.ts -t "MCP"`
Expected: all pass.

- [ ] **Step 5: Update `LLMS_TXT` to advertise the card**

In `server/routes/publicDocs.ts`, in the `LLMS_TXT` constant, inside the `## Docs` section, add one line:

```
- /.well-known/mcp.json — MCP Server Card (tool discovery for MCP-compatible agents)
```

And add an assertion in the existing `/llms.txt` test block in `tests/public-docs.test.ts`:

```ts
it("references the MCP Server Card", async () => {
  const res = await request(buildApp()).get("/llms.txt");
  expect(res.text).toContain("/.well-known/mcp.json");
});
```

- [ ] **Step 6: Typecheck + full test**

Run: `npm run check && npx vitest run tests/public-docs.test.ts`
Expected: clean + all pass.

- [ ] **Step 7: Commit**

```bash
git add server/routes/publicMcpCard.ts server/routes/index.ts server/routes/publicDocs.ts tests/public-docs.test.ts
git commit -m "feat(api): static MCP Server Card at /.well-known/mcp{,/server-card{,s}}.json"
```

---

## Task 15: Pre-deploy check (migration idempotency)

**Files:** none (this task is a CLAUDE.md-mandated verification before push)

- [ ] **Step 1: Run the "check db for deploy" checklist**

Per `CLAUDE.md`:

1. Open the migration `migrations/NNNN_booking_idempotency_keys.sql` — confirm every statement uses `IF NOT EXISTS` / `IF EXISTS`. Fix if not.
2. Run: `npx drizzle-kit push`
   Expected: "Changes applied" with no pending diffs.
3. Run: `npm run check`
   Expected: clean.
4. Open `migrations/meta/_journal.json` — confirm the new entry's `when` is larger than all earlier `when` values.

- [ ] **Step 2: Final full test run**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 3: Status check + confirmation**

Run: `git status`
Expected: working tree clean.

- [ ] **Step 4: Surface behavior changes to the user before deploy**

Print these two notes so they don't surprise a clinic post-deploy:

1. **`POST /book` now enforces `noShowFeeAcknowledged`** at any clinic with a non-empty `noShowFeeMessage`. Previously the SPA was the only enforcement. Any external booking integrations that skip the field against a fee-charging clinic will start getting `400 NOSHOW_FEE_ACK_REQUIRED`.

2. **`POST /cancel-by-token` now enforces `hidePatientCancel`** at the backend. Today the toggle is UI-only. After this ships, patients at a CEO-style clinic who crafted a direct API call to the cancel endpoint (rare but possible) will get `403 CANCELLATION_DISABLED`. This is the intended behavior — the toggle finally matches what it advertises.

Confirm the user is aware of both before they push.

---

## Self-review checklist (completed during writing)

- [x] **Spec coverage** — each of the 9 rollout steps from the spec has at least one task:
  - Rollout 1 (error shape): Tasks 1–3
  - Rollout 2 (CORS): Task 4
  - Rollout 3 (idempotency): Tasks 5–8
  - Rollout 4 (raised limit): Task 9
  - Rollout 5 (OpenAPI): Task 10
  - Rollout 6 (PUBLIC_API_MD): Task 11
  - Rollout 7 (/llms.txt): Task 12
  - Rollout 8 (Admin UI dialog): Task 13
  - Rollout 9 (extended tests): distributed across all preceding tasks + Task 15 for final sweep
  - **Added post-spec: MCP Server Card (Task 14)** — `/.well-known/mcp.json` static discovery manifest, triggered by an isitagentready.com audit of privatklinik-kreuzlingen.ch flagging this path as missing
- [x] **Placeholder scan** — no `TBD`, no `handle edge cases`, no `similar to Task N`. One `it.todo` exists in Task 7 but it's a *documented* contract backfill, not a placeholder.
- [x] **Type consistency** — error codes spelled identically across Tasks 1, 3, 9, 10, 11. Function names (`sendPublicApiError`, `hashBookingRequest`, `findIdempotencyRecord`, `recordIdempotencyKey`, `cleanupExpiredIdempotencyKeys`) used consistently. i18n keys use the nested `bookingTokenSection.shareWithAgents.*` path in all three places they appear.
- [x] **Scope** — all tasks are in the Viali repo. Clinic-website is out of scope (the prompt for it lives inside the admin dialog; no separate work).

## Spec corrections applied during planning

- Spec originally said "i18n keys in 5 locale JSONs"; project actually has 2 (DE + EN). Spec updated.
- Spec originally listed cancel/reschedule as "blocked by CEO policy." Reality: it's per-hospital via `hospitals.hidePatientCancel`. Spec updated; cancellation is now in Phase 1 scope with two documented endpoints + two new error codes (`NOSHOW_FEE_ACK_REQUIRED`, `CANCELLATION_DISABLED`) + backend enforcement of two gaps that were UI-only.

## Handoff

Phase 1 delivers an agent-ready, documented, idempotent, CORS-enabled booking API with a copy-paste prompt for clinic staff. Phase 2 (patient portal API) stays sketched in the spec and will be re-brainstormed when Phase 1 ships.
