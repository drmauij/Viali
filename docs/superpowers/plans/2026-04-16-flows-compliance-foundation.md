# Flows Compliance Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Flows campaign feature a legally defensible consent layer so it can be safely switched on for real customers — filter sends by per-channel marketing consent, honor a per-patient unsubscribe, and inject a working unsubscribe link into every email.

**Architecture:** Opt-out model (Swiss DSG "Bestandskundenwerbung"): every existing patient defaults to marketing-reachable; an unsubscribe flips per-channel booleans (and a `marketingUnsubscribedAt` timestamp as audit). Unsubscribe link is a stateless HMAC-signed token (no DB round-trip to resolve), a tiny public route, no auth. Send loop and segment-preview read the same SQL conditions via a shared helper so the preview count never diverges from actual reach.

**Tech Stack:** Drizzle ORM, Postgres, Express, Node `crypto` (HMAC-SHA256 — no new deps), Vitest + Supertest.

**Prerequisite env var:** `MARKETING_UNSUBSCRIBE_SECRET` must be set in `.env` (and on the Exoscale VPS). In local dev, the token module falls back to `SESSION_SECRET` if the dedicated var is missing.

---

## File Structure

**New files:**
- `migrations/0220_patient_marketing_consent.sql` — idempotent DDL for three new patient columns + one index
- `server/services/marketingUnsubscribeToken.ts` — stateless HMAC token: `generateUnsubscribeToken()` / `verifyUnsubscribeToken()`
- `server/services/marketingConsent.ts` — two helpers: `consentConditionsFor(channel)` (returns Drizzle SQL conditions) and `appendUnsubscribeFooter(html, token, locale)` (mutates email HTML)
- `server/routes/marketingUnsubscribe.ts` — public `GET /unsubscribe/:token` route + confirmation HTML page
- `tests/marketing-unsubscribe-token.test.ts`
- `tests/marketing-unsubscribe-endpoint.test.ts`
- `tests/marketing-consent-filter.test.ts`
- `tests/flows-consent-integration.test.ts`

**Modified files:**
- `shared/schema.ts:868` — add three columns + index entry on the `patients` table
- `server/routes/index.ts` — register `marketingUnsubscribeRouter` in public section (no auth wrapping)
- `server/routes/flows.ts:190` — apply `consentConditionsFor()` to segment-count baseConditions
- `server/routes/flows.ts:872` — apply `consentConditionsFor()` to send-loop baseConditions; pass patient id into execution loop; call `appendUnsubscribeFooter()` on email HTML

---

## Task 1: Schema + idempotent migration

**Files:**
- Modify: `shared/schema.ts:854-868`
- Create: `migrations/0220_patient_marketing_consent.sql`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1: Add columns to `patients` table in `shared/schema.ts`**

Open `shared/schema.ts`. Locate the `patients` pgTable definition — the close of its column list is at line 862 (`archivedBy: ...`). Insert the new columns after that line, before the closing `}, (table) => [`:

```typescript
  archivedBy: varchar("archived_by").references(() => users.id),

  // Marketing consent (opt-out model — existing patients default to reachable,
  // flipped false when patient unsubscribes). See docs/superpowers/plans/2026-04-16-flows-compliance-foundation.md
  smsMarketingConsent: boolean("sms_marketing_consent").default(true).notNull(),
  emailMarketingConsent: boolean("email_marketing_consent").default(true).notNull(),
  marketingUnsubscribedAt: timestamp("marketing_unsubscribed_at"),
}, (table) => [
  index("idx_patients_hospital").on(table.hospitalId),
  index("idx_patients_surname").on(table.surname),
  index("idx_patients_number").on(table.hospitalId, table.patientNumber),
  index("idx_patients_archived").on(table.isArchived),
  index("idx_patients_marketing_consent").on(table.hospitalId, table.smsMarketingConsent, table.emailMarketingConsent),
]);
```

- [ ] **Step 2: Write the migration SQL (idempotent)**

Create `migrations/0220_patient_marketing_consent.sql` with:

```sql
-- Migration 0220: add marketing consent columns to patients
-- Opt-out model — defaults to true so existing patients stay reachable.
-- Idempotent.

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "sms_marketing_consent" boolean NOT NULL DEFAULT true;

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "email_marketing_consent" boolean NOT NULL DEFAULT true;

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "marketing_unsubscribed_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_patients_marketing_consent"
  ON "patients" ("hospital_id", "sms_marketing_consent", "email_marketing_consent");
```

- [ ] **Step 3: Register migration in Drizzle journal**

Open `migrations/meta/_journal.json`. The last entry is `idx: 219` with `when: 1777200000000`. Append a new entry (comma after the current last `}`):

```json
    ,{
      "idx": 220,
      "version": "7",
      "when": 1777300000000,
      "tag": "0220_patient_marketing_consent",
      "breakpoints": true
    }
```

Make sure the closing `]` and `}` of the file stay in place.

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run check`
Expected: exits 0 with no errors.

- [ ] **Step 5: Verify migration is idempotent by running it twice against dev DB**

Run: `npm run db:migrate`
Expected: applies migration, no error.
Run: `npm run db:migrate` again
Expected: no-op, no error (idempotent guards worked).

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts migrations/0220_patient_marketing_consent.sql migrations/meta/_journal.json
git commit -m "feat(flows): add marketing consent columns to patients"
```

---

## Task 2: Unsubscribe token helper (TDD)

**Files:**
- Create: `server/services/marketingUnsubscribeToken.ts`
- Test: `tests/marketing-unsubscribe-token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/marketing-unsubscribe-token.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../server/services/marketingUnsubscribeToken";

describe("marketingUnsubscribeToken", () => {
  beforeEach(() => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret-abc123";
  });

  it("round-trips a valid token", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const result = verifyUnsubscribeToken(token);
    expect(result).toEqual({ patientId: "pat_1", hospitalId: "hosp_1" });
  });

  it("rejects a tampered payload", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const [payload, sig] = token.split(".");
    // flip a character in the payload
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A");
    expect(() => verifyUnsubscribeToken(`${tamperedPayload}.${sig}`)).toThrow(/invalid/i);
  });

  it("rejects a tampered signature", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const [payload] = token.split(".");
    expect(() => verifyUnsubscribeToken(`${payload}.deadbeef`)).toThrow(/invalid/i);
  });

  it("rejects a malformed token (no dot)", () => {
    expect(() => verifyUnsubscribeToken("notatoken")).toThrow(/malformed/i);
  });

  it("produces different signatures for different secrets", () => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "secret-A";
    const tokenA = generateUnsubscribeToken("pat_1", "hosp_1");
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "secret-B";
    expect(() => verifyUnsubscribeToken(tokenA)).toThrow(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/marketing-unsubscribe-token.test.ts`
Expected: FAIL with "Cannot find module" for `../server/services/marketingUnsubscribeToken`.

- [ ] **Step 3: Write the implementation**

Create `server/services/marketingUnsubscribeToken.ts`:

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

interface UnsubscribePayload {
  pid: string; // patient id
  hid: string; // hospital id
  v: 1;        // schema version
}

function getSecret(): string {
  const s =
    process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      "MARKETING_UNSUBSCRIBE_SECRET (or SESSION_SECRET fallback) must be set",
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function generateUnsubscribeToken(
  patientId: string,
  hospitalId: string,
): string {
  const payload: UnsubscribePayload = { pid: patientId, hid: hospitalId, v: 1 };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = sign(payloadB64, getSecret());
  return `${payloadB64}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): {
  patientId: string;
  hospitalId: string;
} {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed unsubscribe token");
  }
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64, getSecret());

  const sigBuf = b64urlDecode(signature);
  const expBuf = b64urlDecode(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid unsubscribe token signature");
  }

  let parsed: UnsubscribePayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("Malformed unsubscribe token payload");
  }

  if (parsed.v !== 1 || !parsed.pid || !parsed.hid) {
    throw new Error("Invalid unsubscribe token payload");
  }
  return { patientId: parsed.pid, hospitalId: parsed.hid };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/marketing-unsubscribe-token.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/marketingUnsubscribeToken.ts tests/marketing-unsubscribe-token.test.ts
git commit -m "feat(flows): HMAC-signed unsubscribe token"
```

---

## Task 3: Consent SQL helper + email footer helper (TDD)

**Files:**
- Create: `server/services/marketingConsent.ts`
- Test: `tests/marketing-consent-filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/marketing-consent-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  consentConditionsFor,
  appendUnsubscribeFooter,
} from "../server/services/marketingConsent";

describe("consentConditionsFor", () => {
  it("returns sms consent condition for sms channel", () => {
    const conds = consentConditionsFor("sms");
    // Just assert shape: 2 conditions returned (sms flag true + not unsubscribed)
    expect(conds).toHaveLength(2);
  });

  it("returns email consent condition for email channel", () => {
    const conds = consentConditionsFor("email");
    expect(conds).toHaveLength(2);
  });

  it("returns email consent condition for html_email channel", () => {
    const conds = consentConditionsFor("html_email");
    expect(conds).toHaveLength(2);
  });

  it("returns empty array for unknown channel (defensive)", () => {
    const conds = consentConditionsFor("unknown");
    expect(conds).toHaveLength(0);
  });
});

describe("appendUnsubscribeFooter", () => {
  it("appends footer with unsubscribe link to HTML", () => {
    const html = "<p>Hello</p>";
    const out = appendUnsubscribeFooter(
      html,
      "tok_abc",
      "https://viali.app",
      "de",
    );
    expect(out).toContain("<p>Hello</p>");
    expect(out).toContain("tok_abc");
    expect(out).toContain("https://viali.app/unsubscribe/tok_abc");
  });

  it("uses German copy for de locale", () => {
    const out = appendUnsubscribeFooter(
      "",
      "tok",
      "https://v.app",
      "de",
    );
    expect(out.toLowerCase()).toContain("abmelden");
  });

  it("uses English copy for en locale", () => {
    const out = appendUnsubscribeFooter(
      "",
      "tok",
      "https://v.app",
      "en",
    );
    expect(out.toLowerCase()).toContain("unsubscribe");
  });

  it("falls back to German for unknown locale", () => {
    const out = appendUnsubscribeFooter("", "tok", "https://v.app", "xx");
    expect(out.toLowerCase()).toContain("abmelden");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/marketing-consent-filter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/services/marketingConsent.ts`:

```typescript
import { isNull, sql, type SQL } from "drizzle-orm";
import { patients } from "../../shared/schema";

/**
 * Returns the Drizzle SQL conditions that must be ANDed into a patient query
 * to respect marketing consent for the given channel. Callers should spread
 * these into their existing `and(...conditions)` list.
 *
 * Channel "sms" requires smsMarketingConsent=true AND not globally unsubscribed.
 * Channels "email" / "html_email" require emailMarketingConsent=true AND not globally unsubscribed.
 */
export function consentConditionsFor(channel: string): SQL[] {
  switch (channel) {
    case "sms":
      return [
        sql`${patients.smsMarketingConsent} = true`,
        isNull(patients.marketingUnsubscribedAt),
      ];
    case "email":
    case "html_email":
      return [
        sql`${patients.emailMarketingConsent} = true`,
        isNull(patients.marketingUnsubscribedAt),
      ];
    default:
      return [];
  }
}

const FOOTER_COPY: Record<string, { intro: string; link: string }> = {
  de: {
    intro:
      "Sie erhalten diese Nachricht, weil Sie Patient:in bei uns sind. Falls Sie keine Marketing-Nachrichten mehr wünschen:",
    link: "Vom Newsletter abmelden",
  },
  en: {
    intro:
      "You are receiving this because you are a patient of our practice. To stop marketing messages:",
    link: "Unsubscribe",
  },
};

export function appendUnsubscribeFooter(
  html: string,
  token: string,
  baseUrl: string,
  locale: string,
): string {
  const copy = FOOTER_COPY[locale] ?? FOOTER_COPY.de;
  const url = `${baseUrl}/unsubscribe/${token}`;
  const footer = `
<hr style="border:none;border-top:1px solid #ccc;margin:24px 0;" />
<p style="font-size:12px;color:#666;font-family:Arial,sans-serif;text-align:center;">
  ${copy.intro}<br />
  <a href="${url}" style="color:#666;">${copy.link}</a>
</p>`;
  return html + footer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/marketing-consent-filter.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/marketingConsent.ts tests/marketing-consent-filter.test.ts
git commit -m "feat(flows): consent SQL + unsubscribe footer helpers"
```

---

## Task 4: Public unsubscribe endpoint (TDD)

**Files:**
- Create: `server/routes/marketingUnsubscribe.ts`
- Test: `tests/marketing-unsubscribe-endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/marketing-unsubscribe-endpoint.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const updateMock = vi.fn().mockResolvedValue(undefined);
const whereMock = vi.fn().mockReturnValue({ execute: vi.fn() });
const setMock = vi.fn().mockReturnValue({ where: whereMock });

vi.mock("../server/db", () => ({
  db: {
    update: vi.fn(() => ({ set: setMock })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret";
  updateMock.mockClear();
  setMock.mockClear();
  whereMock.mockClear();
});

import marketingUnsubscribeRouter from "../server/routes/marketingUnsubscribe";
import { generateUnsubscribeToken } from "../server/services/marketingUnsubscribeToken";

function buildApp() {
  const app = express();
  app.use(marketingUnsubscribeRouter);
  return app;
}

describe("GET /unsubscribe/:token", () => {
  it("returns 200 + confirmation page for valid token (default all channels)", async () => {
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}`);
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("abmelde"); // confirmation page
    // Verify DB update was called with both channels set false + timestamp
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        smsMarketingConsent: false,
        emailMarketingConsent: false,
        marketingUnsubscribedAt: expect.any(Date),
      }),
    );
  });

  it("supports channel=sms to only unsubscribe SMS", async () => {
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}?channel=sms`);
    expect(res.status).toBe(200);
    const patch = setMock.mock.calls[0][0];
    expect(patch.smsMarketingConsent).toBe(false);
    expect(patch.emailMarketingConsent).toBeUndefined();
  });

  it("supports channel=email to only unsubscribe email", async () => {
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}?channel=email`);
    expect(res.status).toBe(200);
    const patch = setMock.mock.calls[0][0];
    expect(patch.emailMarketingConsent).toBe(false);
    expect(patch.smsMarketingConsent).toBeUndefined();
  });

  it("returns 400 for invalid token", async () => {
    const app = buildApp();
    const res = await request(app).get("/unsubscribe/not.a.valid.token");
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed token (no dot)", async () => {
    const app = buildApp();
    const res = await request(app).get("/unsubscribe/garbage");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/marketing-unsubscribe-endpoint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/routes/marketingUnsubscribe.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { patients } from "../../shared/schema";
import { verifyUnsubscribeToken } from "../services/marketingUnsubscribeToken";
import { logger } from "../logger";

const router = Router();

router.get("/unsubscribe/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const channel = (req.query.channel as string | undefined) ?? "all";

  let patientId: string;
  try {
    ({ patientId } = verifyUnsubscribeToken(token));
  } catch (err) {
    logger.warn("[unsubscribe] invalid token:", (err as Error).message);
    res.status(400).type("html").send(renderPage({
      title: "Ungültiger Link",
      body: "Dieser Abmelde-Link ist ungültig oder abgelaufen.",
    }));
    return;
  }

  const patch: Partial<typeof patients.$inferInsert> = {
    marketingUnsubscribedAt: new Date(),
  };
  if (channel === "sms" || channel === "all") patch.smsMarketingConsent = false;
  if (channel === "email" || channel === "all")
    patch.emailMarketingConsent = false;

  try {
    await db.update(patients).set(patch).where(eq(patients.id, patientId));
  } catch (err) {
    logger.error("[unsubscribe] db error:", err);
    res.status(500).type("html").send(renderPage({
      title: "Fehler",
      body: "Die Abmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.",
    }));
    return;
  }

  res.status(200).type("html").send(renderPage({
    title: "Abmeldung bestätigt",
    body:
      channel === "sms"
        ? "Sie erhalten keine Marketing-SMS mehr von uns."
        : channel === "email"
          ? "Sie erhalten keine Marketing-E-Mails mehr von uns."
          : "Sie wurden erfolgreich von allen Marketing-Nachrichten abgemeldet.",
  }));
});

function renderPage({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, Arial, sans-serif; background:#f5f5f5; margin:0; padding:40px 20px; color:#222; }
    .card { max-width:480px; margin:0 auto; background:#fff; padding:32px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    h1 { margin-top:0; font-size:20px; }
    p { line-height:1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/marketing-unsubscribe-endpoint.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Register router in routes index**

Edit `server/routes/index.ts`:

1. Add import near the other route imports (alphabetically with others, or after `flowsRouter`):

```typescript
import marketingUnsubscribeRouter from "./marketingUnsubscribe";
```

2. Register it inside `registerDomainRoutes` — place BEFORE any auth middleware. The right spot is with other public-facing registrations like `publicDocsRouter`:

```typescript
  app.use(flowsRouter);
  app.use(marketingUnsubscribeRouter);
  app.use(publicDocsRouter);
```

- [ ] **Step 6: Verify typecheck + smoke test**

Run: `npm run check`
Expected: exits 0.

Run the dev server (`npm run dev`), then in another terminal:

```bash
# Expect 400 + HTML
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5173/unsubscribe/garbage"
```

Expected: `400`.

- [ ] **Step 7: Commit**

```bash
git add server/routes/marketingUnsubscribe.ts server/routes/index.ts tests/marketing-unsubscribe-endpoint.test.ts
git commit -m "feat(flows): public unsubscribe endpoint"
```

---

## Task 5: Apply consent filter to segment-count endpoint

**Files:**
- Modify: `server/routes/flows.ts:181-300`

- [ ] **Step 1: Apply helper in segment-count baseConditions**

Open `server/routes/flows.ts`. Find the `segment-count` handler starting at line 181. At the top of the handler, import the helper (add to existing import block at top of file):

```typescript
import { consentConditionsFor } from "../services/marketingConsent";
```

Then modify the `baseConditions` assignment (currently at lines 190–194) — but note segment-count doesn't yet take a channel. We need to accept channel as part of the request body (it's needed for correct consent filtering).

Update the Zod schema at the top of the file for segment-count. Locate `segmentFilterSchema` (search for `segmentFilterSchema`). Add a `channel` field:

```typescript
const segmentFilterSchema = z.object({
  channel: z.enum(["sms", "email", "html_email"]).optional(),
  filters: z.array(/* existing */),
});
```

Then in the handler (around line 188):

```typescript
      const { channel, filters } = segmentFilterSchema.parse(req.body);

      const baseConditions: any[] = [
        eq(patients.hospitalId, hospitalId),
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
        ...(channel ? consentConditionsFor(channel) : []),
      ];
```

When `channel` is omitted (e.g. early in draft creation before channel picked), no consent filter applies — preview shows the gross segment. Once channel is picked, the preview honors consent.

- [ ] **Step 2: Update client to pass channel to segment-count**

Search for the client call: `grep -rn "segment-count" client/src`

Open `client/src/components/flows/SegmentBuilder.tsx`. Find the POST to `/api/business/${hospitalId}/flows/segment-count`. Add `channel` to the request body, read from the parent flow draft (prop drill or react-query context — inspect the component to find how it gets other flow state).

If the component doesn't currently know the channel, add a `channel?: string` prop and pass it from `FlowCreate.tsx` where `<SegmentBuilder />` is rendered.

The payload change:

```typescript
body: JSON.stringify({ channel, filters }),
```

- [ ] **Step 3: Write integration test for the endpoint**

Create `tests/flows-consent-integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Capture the conditions passed to the DB query by stubbing db.select chains.
const capturedWhereArgs: any[] = [];

vi.mock("../server/db", () => {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn((arg: any) => {
      capturedWhereArgs.push(arg);
      return Promise.resolve([]);
    }),
  };
  return {
    db: {
      select: vi.fn(() => chain),
      selectDistinct: vi.fn(() => chain),
    },
  };
});

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import flowsRouter from "../server/routes/flows";
import { storage } from "../server/storage";

function buildApp() {
  vi.spyOn(storage, "getUserHospitals").mockResolvedValue([
    { id: "h1", role: "marketing" } as any,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "u1" };
    next();
  });
  app.use(flowsRouter);
  return app;
}

describe("POST /api/business/:hospitalId/flows/segment-count with consent", () => {
  beforeEach(() => {
    capturedWhereArgs.length = 0;
  });

  it("includes consent conditions when channel=sms", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/business/h1/flows/segment-count")
      .send({ channel: "sms", filters: [] });
    expect(res.status).toBe(200);
    // The `and(...)` chunk should contain our sms consent SQL fragment.
    // Drizzle serializes conditions into the `queryChunks` of the SQL object.
    const sqlObj = capturedWhereArgs[0];
    const serialized = JSON.stringify(sqlObj);
    expect(serialized).toContain("sms_marketing_consent");
    expect(serialized).toContain("marketing_unsubscribed_at");
  });

  it("includes email consent when channel=html_email", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/business/h1/flows/segment-count")
      .send({ channel: "html_email", filters: [] });
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(capturedWhereArgs[0]);
    expect(serialized).toContain("email_marketing_consent");
  });

  it("omits consent conditions when channel is absent", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/business/h1/flows/segment-count")
      .send({ filters: [] });
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(capturedWhereArgs[0]);
    expect(serialized).not.toContain("sms_marketing_consent");
    expect(serialized).not.toContain("email_marketing_consent");
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flows-consent-integration.test.ts`
Expected: all 3 tests PASS. If a test fails because the Drizzle SQL serialization doesn't stringify cleanly, inspect `capturedWhereArgs[0]` with `console.log` and adjust the assertion to look at `sqlObj.queryChunks` explicitly.

- [ ] **Step 5: Commit**

```bash
git add server/routes/flows.ts client/src/components/flows/SegmentBuilder.tsx client/src/pages/business/FlowCreate.tsx tests/flows-consent-integration.test.ts
git commit -m "feat(flows): honor consent in segment-count preview"
```

---

## Task 6: Apply consent filter to send endpoint + inject email footer

**Files:**
- Modify: `server/routes/flows.ts:832-1123`

- [ ] **Step 1: Apply consent filter in send loop patient query**

In `server/routes/flows.ts`, find the send handler at line 832. Locate the `conditions` array at line 872 (the send loop's equivalent of baseConditions):

```typescript
      const conditions: any[] = [
        eq(patients.hospitalId, hospitalId),
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
      ];
```

Change to:

```typescript
      const conditions: any[] = [
        eq(patients.hospitalId, hospitalId),
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
        ...consentConditionsFor(flow.channel),
      ];
```

(The import from Task 5 should already exist at the top of the file; if not, add it.)

- [ ] **Step 2: Inject unsubscribe footer into email body**

In the same file, find the email send block (currently lines 1026–1048). Before `await client.emails.send(emailPayload);`, generate a token for this patient and append the footer to the HTML.

Add near the top of the file (with other imports):

```typescript
import { generateUnsubscribeToken } from "../services/marketingUnsubscribeToken";
import { appendUnsubscribeFooter } from "../services/marketingConsent";
```

Then change the email branch inside the `for (const patient of patientResults)` loop. Locate the `html:` payload construction (line 1039). Replace the whole email-channel block so it builds HTML, then appends footer:

```typescript
          } else if (
            (flow.channel === "email" || flow.channel === "html_email") &&
            patient.email
          ) {
            try {
              const { client, fromEmail } = await getUncachableResendClient();
              const subject = flow.messageSubject || "Nachricht von Ihrer Praxis";
              const baseHtml =
                flow.channel === "html_email"
                  ? message
                  : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`;
              const token = generateUnsubscribeToken(patient.id, hospitalId);
              const baseUrl = `${req.protocol}://${req.get("host")}`;
              const htmlWithFooter = appendUnsubscribeFooter(
                baseHtml,
                token,
                baseUrl,
                "de",
              );
              await client.emails.send({
                from: fromEmail,
                to: patient.email,
                subject,
                html: htmlWithFooter,
              });
              sendSuccess = true;
            } catch (e) {
              logger.error("[flows] email send error:", e);
            }
          }
```

- [ ] **Step 3: Add test asserting send-loop filters by consent**

Append to `tests/flows-consent-integration.test.ts`:

```typescript
describe("POST /api/business/:hospitalId/flows/:flowId/send with consent", () => {
  beforeEach(() => {
    capturedWhereArgs.length = 0;
  });

  it("applies sms consent conditions when flow channel is sms", async () => {
    // Seed a fake flow row via the select chain mock
    const chain: any = (await import("../server/db")).db.select();
    chain.where.mockResolvedValueOnce([
      {
        id: "flow_1",
        hospitalId: "h1",
        status: "draft",
        channel: "sms",
        messageTemplate: "Hi {{vorname}}",
        segmentFilters: [],
      },
    ]);
    // The next .where() call is the patient query — we capture it.
    const app = buildApp();
    const res = await request(app).post(
      "/api/business/h1/flows/flow_1/send",
    );
    // The second captured where is the patient query
    const patientWhere = capturedWhereArgs[1];
    const serialized = JSON.stringify(patientWhere);
    expect(serialized).toContain("sms_marketing_consent");
    expect(serialized).toContain("marketing_unsubscribed_at");
    expect(res.status).toBe(200);
  });
});
```

Note: this test is fragile because it walks the mock chain in order. If it's too brittle, simplify by extracting the patient-query builder out of the handler into a testable function (`buildSendSegmentConditions(flow): SQL[]`) and test that directly. Prefer the extraction if the chain test flakes — that's the DRY-correct refactor anyway (both segment-count and send would call the same builder).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flows-consent-integration.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Add test asserting email body contains unsubscribe link**

Append to the same test file:

```typescript
import { appendUnsubscribeFooter } from "../server/services/marketingConsent";
import { generateUnsubscribeToken } from "../server/services/marketingUnsubscribeToken";

describe("email footer integration", () => {
  it("generated token resolves to the same patient", () => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret";
    const token = generateUnsubscribeToken("pat_42", "hosp_9");
    const html = appendUnsubscribeFooter(
      "<p>Hello</p>",
      token,
      "https://viali.app",
      "de",
    );
    expect(html).toContain(`https://viali.app/unsubscribe/${token}`);
  });
});
```

- [ ] **Step 6: Run full flows test suite**

Run: `npx vitest run tests/flows-consent-integration.test.ts tests/marketing-unsubscribe-token.test.ts tests/marketing-consent-filter.test.ts tests/marketing-unsubscribe-endpoint.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/flows.ts tests/flows-consent-integration.test.ts
git commit -m "feat(flows): consent filter + unsubscribe footer in send loop"
```

---

## Task 7: End-to-end smoke + verification

**Files:**
- None (manual verification step)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server starts without errors, migration 0220 applied.

- [ ] **Step 2: Verify migration state**

Run: `npx drizzle-kit push`
Expected: "No changes detected" or "Changes applied" with only ignorable diffs. Schema and DB are in sync.

- [ ] **Step 3: Manually opt out a test patient**

In a psql session or DB client, set one patient opt-out:
```sql
UPDATE patients
SET sms_marketing_consent = false
WHERE id = '<some-test-patient-id>';
```

- [ ] **Step 4: Create a draft SMS flow in the UI targeting that patient's segment**

Navigate to `/business/flows/new`, build a segment that would match the opted-out patient, select SMS channel. Confirm the preview count excludes them (should drop by 1 vs. without the opt-out flag set).

- [ ] **Step 5: Send the campaign and confirm patient_messages has no row for the opted-out patient**

Query:
```sql
SELECT COUNT(*) FROM patient_messages
WHERE patient_id = '<opted-out-id>' AND created_at > NOW() - INTERVAL '1 minute';
```
Expected: 0.

- [ ] **Step 6: Generate a test unsubscribe URL from a send**

Send a test email to yourself (use the test-send endpoint at `/api/business/:hospitalId/flows/test-send`). Open the email, verify the footer with unsubscribe link exists, click it, confirm you land on the confirmation page and DB shows the patient's flags flipped.

- [ ] **Step 7: Run full project test suite + typecheck**

Run: `npm run check && npx vitest run`
Expected: both exit 0.

- [ ] **Step 8: Update public docs for the new public route**

Open `server/routes/publicDocs.ts`. Inside the `PUBLIC_API_MD` template literal, find the section that lists public URLs (search for `/book/` — it will be near the booking link docs). Add a subsection:

```markdown
## Unsubscribe link

Marketing emails sent via Flows include a one-click unsubscribe link of the form:

```
GET /unsubscribe/:token[?channel=sms|email|all]
```

- `token` is an HMAC-signed value binding a patient id and hospital id. It is generated server-side and included in every marketing email footer. Tokens never expire.
- `channel` is optional; `all` (default) turns off both SMS and email marketing. `sms` or `email` scopes the unsubscribe to one channel.
- Invalid or malformed tokens return 400 with a plain HTML error page. No auth header is ever needed.
- Patients stay in the database; only their `sms_marketing_consent`, `email_marketing_consent`, and `marketing_unsubscribed_at` flags change.
```

If `tests/public-docs.test.ts` asserts on specific paths or section headers, add assertions for `/unsubscribe/` and the new subsection header.

- [ ] **Step 9: Final commit**

```bash
git add server/routes/publicDocs.ts tests/public-docs.test.ts
git commit -m "docs(flows): document public unsubscribe route"
```

---

## Notes for the implementing agent

- **Don't skip idempotency.** Every `ALTER TABLE` in the migration MUST have `IF NOT EXISTS`. The Exoscale deploy server re-runs migrations on every boot cycle.
- **Don't invent a channel field on `flowSteps`.** This phase stays on the existing `flows.channel` column.
- **No new npm deps.** HMAC via `node:crypto` is deliberate.
- **Opt-out model is explicit.** `smsMarketingConsent` / `emailMarketingConsent` default `true`, which is correct under Swiss DSG for existing patients of a medical practice sending about similar services. Do not flip those defaults without product review.
- **Don't propagate `questionnaire_responses.smsConsent`** into these new columns as part of this phase. That legacy field is "consent to transactional reminders" and has different legal semantics. A future task can audit and migrate it separately.
- **If extracting the patient-query builder** (suggested in Task 6 Step 3), name it `buildCampaignSegmentConditions(flowOrDraft, channel): SQL[]` and have both segment-count and send call it. That's the correct DRY refactor if the inline-test approach flakes.
