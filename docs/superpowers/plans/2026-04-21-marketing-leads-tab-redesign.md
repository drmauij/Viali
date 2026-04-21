# Marketing → Leads tab redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a proper Marketing → Leads tab: three stat tiles + two charts above a status-filtered, icon-rich, progressively-loaded leads list with CSV export, and fix the mixed-German-in-English labels.

**Architecture:** Backend adds two thin routes (`GET /leads/stats`, `GET /leads/export.csv`) in the existing `server/routes/leads.ts`, both delegating to pure service functions in `server/services/` so they're SQL-shape-testable with the project's existing mocked-`db.execute` pattern. The existing list route gains `from`/`to` filters. Frontend extracts the `SourceIcon` helper out of `LeadsPanel.tsx` into a shared module (DRY for both clinic and marketing) and adds one new component `LeadsStatsCards.tsx`; the existing `LeadsReadOnlyCard` in `Marketing.tsx` grows pills + icons + a "Load more…" cursor. Missing `business.leads.*` keys get added to `en.json` and new keys to both locales.

**Tech Stack:** React + TanStack Query, Drizzle ORM + Postgres, Express, Recharts, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-21-marketing-leads-tab-redesign-design.md`

---

## File Structure

```
server/
├─ services/
│  ├─ leadsMetrics.ts                        (NEW — pure stats query builder)
│  └─ leadsCsvExport.ts                      (NEW — pure CSV string builder)
└─ routes/
   └─ leads.ts                               (MODIFY — add /stats + /export.csv routes, extend /leads with from/to)

client/
├─ components/leads/
│  ├─ sourceIcon.tsx                         (NEW — extracted from LeadsPanel.tsx)
│  └─ LeadsPanel.tsx                         (MODIFY — import from sourceIcon.tsx, drop locals)
├─ pages/business/
│  ├─ Marketing.tsx                          (MODIFY — retrofit LeadsReadOnlyCard)
│  └─ marketing/
│     └─ LeadsStatsCards.tsx                 (NEW — 3 tiles + 2 charts)
└─ i18n/locales/
   ├─ en.json                                (MODIFY — add missing business.leads.* keys)
   └─ de.json                                (MODIFY — add new-surface keys)

tests/
├─ leads-metrics-query.test.ts               (NEW — SQL-shape tests for getLeadsStats)
├─ leads-csv-export.test.ts                  (NEW — pure builder unit tests)
└─ leads-list-filters.test.ts                (NEW — SQL-shape test for from/to on list)
```

Each service file has one public function. Route handlers stay thin (parse params → call service → respond). Frontend splits so `Marketing.tsx` doesn't grow further than it must.

---

## Task 1: Shared `SourceIcon` module (DRY fix)

**Files:**
- Create: `client/src/components/leads/sourceIcon.tsx`
- Modify: `client/src/components/leads/LeadsPanel.tsx:50-53, 89-153` (remove locals, import from new module)

- [ ] **Step 1: Create the shared module**

Write `client/src/components/leads/sourceIcon.tsx`:

```tsx
import { Instagram, Globe } from "lucide-react";

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      width="16"
      height="16"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function SourceIcon({ source, className = "h-4 w-4" }: { source: string; className?: string }) {
  if (source === "ig") return <Instagram className={`${className} text-pink-500`} />;
  if (source === "fb") return <FacebookIcon className={`${className} text-blue-600`} />;
  return <Globe className={`${className} text-green-600`} />;
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "fb": return "Facebook";
    case "ig": return "Instagram";
    case "website": return "Website";
    case "email": return "E-Mail";
    default: return source;
  }
}
```

- [ ] **Step 2: Retrofit `LeadsPanel.tsx`**

In `client/src/components/leads/LeadsPanel.tsx`:

1. Remove `Instagram` and `Globe` from the `lucide-react` import (lines around 50–56) if not used elsewhere in the file — keep them if they are.
2. Remove the inline `FacebookIcon` function (lines 89–103).
3. Remove the inline `SourceIcon` function (lines 133–143) and `sourceLabel` function (lines 145–153).
4. Add this import near the top of the file:

```tsx
import { SourceIcon, sourceLabel, FacebookIcon } from "./sourceIcon";
```

(Only re-import `FacebookIcon` if the file uses it directly outside `SourceIcon` — verify with a grep before removing.)

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: PASS with no new errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/leads/sourceIcon.tsx client/src/components/leads/LeadsPanel.tsx
git commit -m "refactor(leads): extract SourceIcon/FacebookIcon/sourceLabel into shared module"
```

---

## Task 2: `getLeadsStats` service — TDD

**Files:**
- Create: `server/services/leadsMetrics.ts`
- Create: `tests/leads-metrics-query.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/leads-metrics-query.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const capturedSql: string[] = [];

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(async (sqlObj: any) => {
      capturedSql.push(JSON.stringify(sqlObj));
      return { rows: [] } as any;
    }),
  },
}));

beforeEach(() => {
  capturedSql.length = 0;
  vi.clearAllMocks();
});

import { getLeadsStats } from "../server/services/leadsMetrics";

describe("getLeadsStats", () => {
  const H = "hospital-1";

  it("scopes every query to the hospital id", async () => {
    await getLeadsStats(H, {});
    // 5 queries: total, bySource, convBySource, avgDays, timeseries
    expect(capturedSql).toHaveLength(5);
    for (const q of capturedSql) {
      expect(q).toContain("hospital_id");
      expect(q).toContain(H);
    }
  });

  it("uses 'converted' status OR appointment_id for the conversion filter", async () => {
    await getLeadsStats(H, {});
    const all = capturedSql.join(" ");
    expect(all).toMatch(/status\s*=\s*'converted'/i);
    expect(all).toMatch(/appointment_id\s+is\s+not\s+null/i);
  });

  it("groups the by-source query by source", async () => {
    await getLeadsStats(H, {});
    // At least one query contains "GROUP BY source" and a COUNT
    const hasGroupBySource = capturedSql.some(q => /group\s+by\s+source/i.test(q));
    expect(hasGroupBySource).toBe(true);
  });

  it("computes avg days from clinic_appointments.created_at minus leads.created_at and skips null appointment timestamps", async () => {
    await getLeadsStats(H, {});
    const all = capturedSql.join(" ");
    expect(all).toContain("clinic_appointments");
    expect(all).toMatch(/ca\.created_at\s*-\s*l\.created_at/);
    expect(all).toMatch(/ca\.created_at\s+is\s+not\s+null/i);
    expect(all).toContain("86400"); // epoch → days
  });

  it("groups timeseries by month using hospital timezone", async () => {
    await getLeadsStats(H, { timezone: "Europe/Zurich" });
    const all = capturedSql.join(" ");
    expect(all).toMatch(/date_trunc\('month'/i);
    expect(all).toContain("Europe/Zurich");
  });

  it("applies the from lower bound when provided", async () => {
    await getLeadsStats(H, { from: "2026-01-01T00:00:00Z" });
    const all = capturedSql.join(" ");
    expect(all).toContain("2026-01-01T00:00:00Z");
    expect(all).toMatch(/created_at\s*>=\s*\$/);
  });

  it("always applies an upper bound on created_at (defaults to now when omitted)", async () => {
    await getLeadsStats(H, {});
    const all = capturedSql.join(" ");
    expect(all).toMatch(/created_at\s*<=\s*\$/);
  });

  it("returns zeroed/empty result when every query returns no rows", async () => {
    const stats = await getLeadsStats(H, {});
    expect(stats).toEqual({
      total: 0,
      bySource: [],
      conversionOverall: 0,
      conversionBySource: [],
      avgDaysToConversion: null,
      timeseries: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leads-metrics-query.test.ts`
Expected: FAIL with module-not-found for `../server/services/leadsMetrics`.

- [ ] **Step 3: Implement the service**

Write `server/services/leadsMetrics.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface ConversionBySourceRow {
  source: string;
  total: number;
  converted: number;
  rate: number;
}

export interface BySourceRow {
  source: string;
  count: number;
}

export interface TimeseriesRow {
  month: string;
  count: number;
}

export interface LeadsStats {
  total: number;
  bySource: BySourceRow[];
  conversionOverall: number;
  conversionBySource: ConversionBySourceRow[];
  avgDaysToConversion: number | null;
  timeseries: TimeseriesRow[];
}

export interface GetLeadsStatsOpts {
  from?: string;
  to?: string;
  timezone?: string;
}

export async function getLeadsStats(
  hospitalId: string,
  opts: GetLeadsStatsOpts = {},
): Promise<LeadsStats> {
  const fromParam: string | null = opts.from ?? null;
  const toParam: string = opts.to ?? new Date().toISOString();
  const tz: string = opts.timezone ?? "UTC";

  const { rows: totals } = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'converted' OR appointment_id IS NOT NULL
      )::int AS converted
    FROM leads
    WHERE hospital_id = ${hospitalId}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
  `);

  const { rows: bySource } = await db.execute(sql`
    SELECT source, COUNT(*)::int AS count
    FROM leads
    WHERE hospital_id = ${hospitalId}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
    GROUP BY source
    ORDER BY count DESC
  `);

  const { rows: convBySource } = await db.execute(sql`
    SELECT
      source,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'converted' OR appointment_id IS NOT NULL
      )::int AS converted
    FROM leads
    WHERE hospital_id = ${hospitalId}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
    GROUP BY source
    ORDER BY total DESC
  `);

  const { rows: avg } = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (ca.created_at - l.created_at)) / 86400.0)::float8 AS avg_days
    FROM leads l
    JOIN clinic_appointments ca ON ca.id = l.appointment_id
    WHERE l.hospital_id = ${hospitalId}
      AND ca.created_at IS NOT NULL
      AND (${fromParam}::timestamptz IS NULL OR l.created_at >= ${fromParam}::timestamptz)
      AND l.created_at <= ${toParam}::timestamptz
  `);

  const { rows: timeseries } = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', created_at AT TIME ZONE ${tz}), 'YYYY-MM') AS month,
      COUNT(*)::int AS count
    FROM leads
    WHERE hospital_id = ${hospitalId}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
    GROUP BY month
    ORDER BY month
  `);

  const totalCount = Number(totals[0]?.total ?? 0);
  const convertedAll = Number(totals[0]?.converted ?? 0);

  return {
    total: totalCount,
    bySource: bySource.map((r: any) => ({ source: String(r.source), count: Number(r.count) })),
    conversionOverall: totalCount > 0 ? convertedAll / totalCount : 0,
    conversionBySource: convBySource.map((r: any) => {
      const t = Number(r.total);
      const c = Number(r.converted);
      return {
        source: String(r.source),
        total: t,
        converted: c,
        rate: t > 0 ? c / t : 0,
      };
    }),
    avgDaysToConversion: avg[0]?.avg_days == null ? null : Number(avg[0].avg_days),
    timeseries: timeseries.map((r: any) => ({ month: String(r.month), count: Number(r.count) })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leads-metrics-query.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add server/services/leadsMetrics.ts tests/leads-metrics-query.test.ts
git commit -m "feat(leads): getLeadsStats service with SQL-shape tests"
```

---

## Task 3: `GET /leads/stats` route

**Files:**
- Modify: `server/routes/leads.ts` (add new route before the admin-middleware section around line 961)

- [ ] **Step 1: Add the handler**

Append this handler to `server/routes/leads.ts` immediately after the `/leads-count` handler (around line 959), before `async function isAdmin`:

```ts
// 6. Aggregated marketing stats for the Leads tab
router.get(
  "/api/business/:hospitalId/leads/stats",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const from = (req.query.from as string | undefined) || undefined;
      const to = (req.query.to as string | undefined) || undefined;

      const [hospital] = await db
        .select({ timezone: hospitals.timezone })
        .from(hospitals)
        .where(eq(hospitals.id, hospitalId));

      const stats = await getLeadsStats(hospitalId, {
        from,
        to,
        timezone: hospital?.timezone ?? "UTC",
      });

      return res.json(stats);
    } catch (err) {
      logger.error({ err }, "Error computing leads stats");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
```

- [ ] **Step 2: Add the import**

At the top of `server/routes/leads.ts`, find the services/helpers import block and add:

```ts
import { getLeadsStats } from "../services/leadsMetrics";
```

- [ ] **Step 3: TypeScript check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/leads.ts
git commit -m "feat(leads): GET /api/business/:id/leads/stats route"
```

---

## Task 4: Extend `GET /leads` with `from` / `to`

**Files:**
- Modify: `server/routes/leads.ts:515-528`
- Create: `tests/leads-list-filters.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/leads-list-filters.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const capturedSql: string[] = [];

vi.mock("../server/db", () => {
  const execute = vi.fn(async (sqlObj: any) => {
    capturedSql.push(JSON.stringify(sqlObj));
    return { rows: [] } as any;
  });

  // Chainable select().from().where().orderBy().limit() that records a
  // single combined SQL string into capturedSql.
  const recorder: any = {};
  const parts: string[] = [];
  const push = (s: string) => { parts.push(s); return recorder; };
  recorder.select = (cols: any) => push(`SELECT ${JSON.stringify(cols)}`);
  recorder.from = (tbl: any) => push(`FROM ${String(tbl?.[Symbol.for("drizzle:Name")] ?? "")}`);
  recorder.where = (cond: any) => push(`WHERE ${JSON.stringify(cond)}`);
  recorder.orderBy = (expr: any) => push(`ORDER_BY ${JSON.stringify(expr)}`);
  recorder.limit = async (n: number) => {
    capturedSql.push(parts.concat(`LIMIT ${n}`).join(" | "));
    parts.length = 0;
    return [];
  };

  return {
    db: {
      execute,
      select: recorder.select,
    },
  };
});

beforeEach(() => {
  capturedSql.length = 0;
  vi.clearAllMocks();
});

describe("GET /leads — from/to filters", () => {
  it("passes from and to through to the condition builder", async () => {
    // Import lazily so the mock is installed before the route module loads.
    const mod = await import("../server/routes/leads");
    const buildLeadsListConditions = (mod as any).buildLeadsListConditions;
    expect(typeof buildLeadsListConditions).toBe("function");

    const conds = buildLeadsListConditions({
      hospitalId: "h1",
      status: "all",
      from: "2026-01-01T00:00:00Z",
      to: "2026-04-01T00:00:00Z",
      before: undefined,
    });

    // The builder should emit 3 conditions: hospital_id eq, from gte, to lte
    const serialized = JSON.stringify(conds);
    expect(serialized).toContain("hospital_id");
    expect(serialized).toContain("2026-01-01T00:00:00Z");
    expect(serialized).toContain("2026-04-01T00:00:00Z");
  });

  it("omits the from/to conditions when not provided", async () => {
    const mod = await import("../server/routes/leads");
    const buildLeadsListConditions = (mod as any).buildLeadsListConditions;
    const conds = buildLeadsListConditions({
      hospitalId: "h1",
      status: "all",
      from: undefined,
      to: undefined,
      before: undefined,
    });
    // Exactly 1 condition (hospital id)
    expect(conds).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leads-list-filters.test.ts`
Expected: FAIL — `buildLeadsListConditions` is not exported.

- [ ] **Step 3: Refactor route to extract conditions and add `from`/`to`**

In `server/routes/leads.ts`, add `gte, lte` to the drizzle-orm import at line 4:

```ts
import { eq, and, desc, sql, lt, gte, lte } from "drizzle-orm";
```

Add this exported helper just above the list route (before line ~508):

```ts
export function buildLeadsListConditions(args: {
  hospitalId: string;
  status: string;
  from?: string;
  to?: string;
  before?: string;
}) {
  const conditions = [eq(leads.hospitalId, args.hospitalId)];
  if (args.status && args.status !== "all") {
    conditions.push(eq(leads.status, args.status as any));
  }
  if (args.from) {
    conditions.push(gte(leads.createdAt, new Date(args.from)));
  }
  if (args.to) {
    conditions.push(lte(leads.createdAt, new Date(args.to)));
  }
  if (args.before) {
    conditions.push(lt(leads.createdAt, new Date(args.before)));
  }
  return conditions;
}
```

Then replace the inline condition-building in the list handler (current lines ~515–528) with:

```ts
      const { hospitalId } = req.params;
      const status = (req.query.status as string) || "all";
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const before = req.query.before as string | undefined;
      const from = (req.query.from as string | undefined) || undefined;
      const to = (req.query.to as string | undefined) || undefined;

      const conditions = buildLeadsListConditions({ hospitalId, status, from, to, before });
```

Leave everything else in that handler unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leads-list-filters.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: TypeScript check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/leads.ts tests/leads-list-filters.test.ts
git commit -m "feat(leads): support from/to range on GET /api/business/:id/leads"
```

---

## Task 5: CSV export — TDD

**Files:**
- Create: `server/services/leadsCsvExport.ts`
- Create: `tests/leads-csv-export.test.ts`
- Modify: `server/routes/leads.ts` (add `/leads/export.csv` route)

- [ ] **Step 1: Write the failing test**

Write `tests/leads-csv-export.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLeadsCsv, type LeadCsvRow, BOM } from "../server/services/leadsCsvExport";

const row = (over: Partial<LeadCsvRow> = {}): LeadCsvRow => ({
  id: "l1",
  firstName: "Maria",
  lastName: "Müller",
  email: "maria@example.com",
  phone: "+41791234567",
  source: "ig",
  status: "new",
  appointmentId: null,
  contactCount: 0,
  lastContactOutcome: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  createdAt: new Date("2026-04-21T09:00:00Z"),
  ...over,
});

describe("buildLeadsCsv", () => {
  it("prepends UTF-8 BOM so Excel recognises encoding", () => {
    const csv = buildLeadsCsv([]);
    expect(csv.startsWith(BOM)).toBe(true);
  });

  it("emits the fixed header row", () => {
    const csv = buildLeadsCsv([]);
    const lines = csv.replace(BOM, "").split("\n");
    expect(lines[0]).toBe(
      "id,first_name,last_name,email,phone,source,status,converted,contact_count,last_contact_outcome,utm_source,utm_medium,utm_campaign,utm_term,utm_content,created_at",
    );
  });

  it("derives converted=yes when status is converted", () => {
    const csv = buildLeadsCsv([row({ status: "converted" })]);
    const lines = csv.replace(BOM, "").split("\n");
    // converted is column index 7 (0-based)
    expect(lines[1].split(",")[7]).toBe("yes");
  });

  it("derives converted=yes when appointment_id is present even if status is not converted", () => {
    const csv = buildLeadsCsv([row({ status: "in_progress", appointmentId: "ap1" })]);
    const lines = csv.replace(BOM, "").split("\n");
    expect(lines[1].split(",")[7]).toBe("yes");
  });

  it("derives converted=no when neither signal is present", () => {
    const csv = buildLeadsCsv([row({ status: "new", appointmentId: null })]);
    const lines = csv.replace(BOM, "").split("\n");
    expect(lines[1].split(",")[7]).toBe("no");
  });

  it("quotes and escapes values that contain commas, quotes, or newlines", () => {
    const csv = buildLeadsCsv([row({ lastName: 'He said "hi", then left' })]);
    const lines = csv.replace(BOM, "").split("\n");
    expect(lines[1]).toContain('"He said ""hi"", then left"');
  });

  it("emits empty strings for null optional fields", () => {
    const csv = buildLeadsCsv([row({ email: null, phone: null, utmCampaign: null })]);
    const lines = csv.replace(BOM, "").split("\n");
    const cols = lines[1].split(",");
    // email is idx 3, phone idx 4, utm_campaign idx 12
    expect(cols[3]).toBe("");
    expect(cols[4]).toBe("");
    expect(cols[12]).toBe("");
  });

  it("serialises created_at as ISO-8601 UTC", () => {
    const csv = buildLeadsCsv([row()]);
    const lines = csv.replace(BOM, "").split("\n");
    expect(lines[1]).toContain("2026-04-21T09:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leads-csv-export.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure builder**

Write `server/services/leadsCsvExport.ts`:

```ts
export const BOM = "\uFEFF";

export interface LeadCsvRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  appointmentId: string | null;
  contactCount: number;
  lastContactOutcome: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  createdAt: Date;
}

const HEADER = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "source",
  "status",
  "converted",
  "contact_count",
  "last_contact_outcome",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "created_at",
];

function escape(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildLeadsCsv(rows: LeadCsvRow[]): string {
  const lines: string[] = [HEADER.join(",")];
  for (const r of rows) {
    const converted = r.status === "converted" || r.appointmentId !== null ? "yes" : "no";
    lines.push(
      [
        escape(r.id),
        escape(r.firstName),
        escape(r.lastName),
        escape(r.email),
        escape(r.phone),
        escape(r.source),
        escape(r.status),
        escape(converted),
        escape(r.contactCount),
        escape(r.lastContactOutcome),
        escape(r.utmSource),
        escape(r.utmMedium),
        escape(r.utmCampaign),
        escape(r.utmTerm),
        escape(r.utmContent),
        escape(r.createdAt.toISOString()),
      ].join(","),
    );
  }
  return BOM + lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leads-csv-export.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Add the export route**

Append this handler to `server/routes/leads.ts` immediately after the `/leads/stats` handler from Task 3:

```ts
// 7. CSV export of leads in the current filter window
router.get(
  "/api/business/:hospitalId/leads/export.csv",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const status = (req.query.status as string) || "all";
      const from = (req.query.from as string | undefined) || undefined;
      const to = (req.query.to as string | undefined) || undefined;

      const conditions = buildLeadsListConditions({ hospitalId, status, from, to });

      const rows = await db
        .select({
          id: leads.id,
          firstName: leads.firstName,
          lastName: leads.lastName,
          email: leads.email,
          phone: leads.phone,
          source: leads.source,
          status: leads.status,
          appointmentId: leads.appointmentId,
          utmSource: leads.utmSource,
          utmMedium: leads.utmMedium,
          utmCampaign: leads.utmCampaign,
          utmTerm: leads.utmTerm,
          utmContent: leads.utmContent,
          createdAt: leads.createdAt,
          contactCount: sql<number>`(SELECT COUNT(*) FROM lead_contacts WHERE lead_id = "leads"."id")`.as("contact_count"),
          lastContactOutcome: sql<string | null>`(SELECT outcome FROM lead_contacts WHERE lead_id = "leads"."id" ORDER BY created_at DESC LIMIT 1)`.as("last_contact_outcome"),
        })
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.createdAt));

      const csv = buildLeadsCsv(
        rows.map((r) => ({
          ...r,
          contactCount: Number(r.contactCount),
          createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as any),
        })) as LeadCsvRow[],
      );

      const today = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="leads-${hospitalId}-${today}.csv"`,
      );
      return res.send(csv);
    } catch (err) {
      logger.error({ err }, "Error exporting leads CSV");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
```

Add the imports at the top of `server/routes/leads.ts`:

```ts
import { buildLeadsCsv, type LeadCsvRow } from "../services/leadsCsvExport";
```

(`buildLeadsListConditions` is already exported from the same file, so no import needed.)

- [ ] **Step 6: TypeScript check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/services/leadsCsvExport.ts tests/leads-csv-export.test.ts server/routes/leads.ts
git commit -m "feat(leads): CSV export endpoint with escaping + UTF-8 BOM"
```

---

## Task 6: Frontend — `LeadsStatsCards` component

**Files:**
- Create: `client/src/pages/business/marketing/LeadsStatsCards.tsx`

- [ ] **Step 1: Create the component**

Write `client/src/pages/business/marketing/LeadsStatsCards.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sourceLabel } from "@/components/leads/sourceIcon";

interface LeadsStatsResponse {
  total: number;
  bySource: Array<{ source: string; count: number }>;
  conversionOverall: number;
  conversionBySource: Array<{ source: string; total: number; converted: number; rate: number }>;
  avgDaysToConversion: number | null;
  timeseries: Array<{ month: string; count: number }>;
}

const SOURCE_COLORS: Record<string, string> = {
  ig: "#ec4899",
  fb: "#3b82f6",
  website: "#10b981",
  email: "#f59e0b",
  default: "#64748b",
};

function color(source: string) {
  return SOURCE_COLORS[source] ?? SOURCE_COLORS.default;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function LeadsStatsCards({
  hospitalId,
  from,
  to,
}: {
  hospitalId: string;
  from: string;
  to: string;
}) {
  const { t } = useTranslation();

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const url = `/api/business/${hospitalId}/leads/stats${qs ? `?${qs}` : ""}`;

  const { data, isLoading, isError } = useQuery<LeadsStatsResponse>({
    queryKey: [url],
    enabled: !!hospitalId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground text-center">
          {t("business.leads.stats.error", "Could not load lead statistics.")}
        </CardContent>
      </Card>
    );
  }

  const { total, bySource, conversionOverall, conversionBySource, avgDaysToConversion, timeseries } = data;

  return (
    <div className="space-y-3">
      {/* Row 1: three stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("business.leads.stats.totalLeads", "Total leads")}
            </div>
            <div className="text-2xl font-semibold">{total.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              {t("business.leads.stats.inRange", "in range")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("business.leads.stats.conversionRate", "Conversion rate")}
            </div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {total > 0 ? formatPct(conversionOverall) : "—"}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {conversionBySource.map((r) => (
                <span key={r.source}>
                  {sourceLabel(r.source)} {formatPct(r.rate)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("business.leads.stats.avgDaysToConversion", "Avg days to conversion")}
            </div>
            <div className="text-2xl font-semibold">
              {avgDaysToConversion == null ? "—" : avgDaysToConversion.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("business.leads.stats.leadToAppointment", "lead → appointment")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: two charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("business.leads.charts.bySource", "Leads by source")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("business.leads.empty", "No leads yet.")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={bySource.map((r) => ({ name: sourceLabel(r.source), value: r.count, source: r.source }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                  >
                    {bySource.map((r) => (
                      <Cell key={r.source} fill={color(r.source)} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={24} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t("business.leads.charts.overTime", "Leads over time")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeseries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("business.leads.empty", "No leads yet.")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={timeseries}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/business/marketing/LeadsStatsCards.tsx
git commit -m "feat(marketing): LeadsStatsCards — 3 tiles + source pie + monthly bars"
```

---

## Task 7: Retrofit `LeadsReadOnlyCard` in Marketing.tsx

**Files:**
- Modify: `client/src/pages/business/Marketing.tsx:128-235` (replace `LeadsReadOnlyCard`)
- Modify: `client/src/pages/business/Marketing.tsx:786-788` (pass from/to into the card)

- [ ] **Step 1: Replace the `LeadRow` type, `LeadsReadOnlyCard`, and `LeadStatusPill` block**

In `client/src/pages/business/Marketing.tsx`, replace the section from the `type LeadRow = {` declaration (line ~115) through the end of `function LeadStatusPill` (line ~265) with:

```tsx
type LeadStatus = "new" | "in_progress" | "converted" | "closed";

type LeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: LeadStatus;
  appointmentId: string | null;
  contactCount: number;
  lastContactAt: string | null;
  createdAt: string;
};

const LEAD_PAGE_SIZE = 50;
const STATUS_FILTERS: Array<"all" | LeadStatus> = ["all", "new", "in_progress", "converted", "closed"];

function LeadStatusPill({ status }: { status: LeadStatus }) {
  const { t } = useTranslation();
  const map: Record<LeadStatus, { label: string; cls: string }> = {
    new: {
      label: t("business.leads.status.new", "New"),
      cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/30",
    },
    in_progress: {
      label: t("business.leads.status.in_progress", "In Progress"),
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    },
    converted: {
      label: t("business.leads.status.converted", "Converted"),
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
    },
    closed: {
      label: t("business.leads.status.closed", "Closed"),
      cls: "bg-muted text-muted-foreground ring-border",
    },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function LeadsReadOnlyCard({
  hospitalId,
  from,
  to,
}: {
  hospitalId: string;
  from: string;
  to: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [leadsList, setLeadsList] = useState<LeadRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = new URLSearchParams();
  params.set("limit", String(LEAD_PAGE_SIZE));
  if (status !== "all") params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const listUrl = `/api/business/${hospitalId}/leads?${params.toString()}`;

  const { isLoading } = useQuery<LeadRow[]>({
    queryKey: [listUrl],
    enabled: !!hospitalId,
    queryFn: async () => {
      const res = await fetch(listUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load leads");
      const data: LeadRow[] = await res.json();
      setLeadsList(data);
      setHasMore(data.length === LEAD_PAGE_SIZE);
      return data;
    },
  });

  const loadMore = useCallback(async () => {
    if (!hospitalId || loadingMore || !hasMore) return;
    const last = leadsList[leadsList.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const more = new URLSearchParams(params);
      more.set("before", last.createdAt);
      const res = await fetch(
        `/api/business/${hospitalId}/leads?${more.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load more leads");
      const page: LeadRow[] = await res.json();
      setLeadsList((prev) => [...prev, ...page]);
      setHasMore(page.length === LEAD_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [hospitalId, leadsList, hasMore, loadingMore, params]);

  const exportParams = new URLSearchParams();
  if (status !== "all") exportParams.set("status", status);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const exportUrl = `/api/business/${hospitalId}/leads/export.csv${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg">
              {t("business.leads.title", "Leads")}
            </CardTitle>
            <CardDescription>
              {t(
                "business.leads.description",
                "Read-only overview of incoming leads with status and conversion.",
              )}
            </CardDescription>
          </div>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            data-testid="leads-export-csv"
          >
            <Download className="h-3.5 w-3.5" />
            {t("business.leads.export.csv", "Export CSV")}
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                status === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              data-testid={`lead-filter-${f}`}
            >
              {f === "all"
                ? t("business.leads.filter.all", "All")
                : t(`business.leads.status.${f}`, f)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : leadsList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {t("business.leads.empty", "No leads yet.")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.name", "Name")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.source", "Source")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.status", "Status")}</th>
                    <th className="text-right font-medium px-2 py-2">{t("business.leads.col.contacts", "Contacts")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.converted", "Converted")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.created", "Received")}</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsList.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-2 py-2 font-medium">
                        {`${l.firstName} ${l.lastName}`.trim() || "—"}
                        {(l.email || l.phone) && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {l.email || l.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex items-center gap-1 text-muted-foreground"
                          title={sourceLabel(l.source)}
                        >
                          <SourceIcon source={l.source} />
                          <span className="sr-only">{sourceLabel(l.source)}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <LeadStatusPill status={l.status} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {l.contactCount}
                        {l.contactCount > 0 && (
                          <Phone className="inline-block ml-1 h-3 w-3 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {l.appointmentId || l.status === "converted" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("business.leads.yes", "Yes")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("business.leads.no", "No")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {new Date(l.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("common.loading", "Loading...")}</>
                  ) : (
                    t("common.loadMore", "Load more")
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add the new imports at the top of the file**

Near the top of `client/src/pages/business/Marketing.tsx`, extend the existing imports:

```tsx
import { useCallback } from "react"; // extend existing react import
import { Download } from "lucide-react"; // extend existing lucide-react import
import { SourceIcon, sourceLabel } from "@/components/leads/sourceIcon";
import { LeadsStatsCards } from "./marketing/LeadsStatsCards";
```

(Merge `useCallback` and `Download` into existing import lines rather than adding duplicates. `useQuery`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `Phone`, `CheckCircle2`, `Loader2`, `Button` are already imported — don't add duplicates.)

- [ ] **Step 3: Wire stats cards into the Leads tab**

Find the existing `<TabsContent value="leads">` block around line 786 and replace its body:

```tsx
            <TabsContent value="leads" className="space-y-4">
              <LeadsStatsCards
                hospitalId={activeHospital?.id ?? ""}
                from={referralFrom}
                to={referralTo}
              />
              <LeadsReadOnlyCard
                hospitalId={activeHospital?.id ?? ""}
                from={referralFrom}
                to={referralTo}
              />
            </TabsContent>
```

- [ ] **Step 4: TypeScript check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Manual smoke test in the dev server**

```bash
npm run dev
```

Open `/business/marketing`, switch to the **Leads** tab. Verify:
- Three stat tiles render above the list.
- Pie chart shows distribution; monthly bars render under "Leads over time".
- Status pills switch the list cleanly (clicking "Converted" shows only converted leads).
- "Load more…" appears only if the first page returned exactly 50 rows.
- Source column shows the Instagram / Facebook / Globe icons — hovering the icon shows a tooltip (`title` attribute).
- Clicking "Export CSV" triggers a file download named `leads-<hospitalId>-YYYY-MM-DD.csv`; opening it in Excel shows proper UTF-8 umlauts.
- Changing Von/Bis at the top of the page re-runs the stats query, the list, and updates the CSV URL.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/business/Marketing.tsx
git commit -m "feat(marketing): pills + icons + load-more + CSV on Leads tab"
```

---

## Task 8: i18n — fill in missing keys

**Files:**
- Modify: `client/src/i18n/locales/en.json`
- Modify: `client/src/i18n/locales/de.json`

- [ ] **Step 1: Add missing EN keys**

In `client/src/i18n/locales/en.json`, find the `"business": { … "leads": { … } }` object (the one around line 5542 that contains `pasteLeads`, `conversionFunnel`, etc.). Add these sibling keys inside `leads`:

```json
      "title": "Leads",
      "description": "Read-only overview of incoming leads with status and conversion.",
      "totalShown": "shown in range",
      "empty": "No leads yet.",
      "yes": "Yes",
      "no": "No",
      "col": {
        "name": "Name",
        "source": "Source",
        "status": "Status",
        "contacts": "Contacts",
        "converted": "Converted",
        "created": "Received"
      },
      "status": {
        "new": "New",
        "in_progress": "In Progress",
        "converted": "Converted",
        "closed": "Closed"
      },
      "stats": {
        "totalLeads": "Total leads",
        "inRange": "in range",
        "conversionRate": "Conversion rate",
        "avgDaysToConversion": "Avg days to conversion",
        "leadToAppointment": "lead → appointment",
        "error": "Could not load lead statistics."
      },
      "charts": {
        "bySource": "Leads by source",
        "overTime": "Leads over time"
      },
      "filter": {
        "all": "All"
      },
      "export": {
        "csv": "Export CSV"
      }
```

- [ ] **Step 2: Add the new-surface DE keys**

In `client/src/i18n/locales/de.json`, find the same `"business": { … "leads": { … } }` object (around line 5542) — `title`, `description`, `status.*`, `col.*` already exist. Add these sibling keys inside `leads`:

```json
      "stats": {
        "totalLeads": "Leads insgesamt",
        "inRange": "im Zeitraum",
        "conversionRate": "Konversionsrate",
        "avgDaysToConversion": "Ø Tage bis zur Konversion",
        "leadToAppointment": "Lead → Termin",
        "error": "Lead-Statistik konnte nicht geladen werden."
      },
      "charts": {
        "bySource": "Leads nach Quelle",
        "overTime": "Leads im Zeitverlauf"
      },
      "filter": {
        "all": "Alle"
      },
      "export": {
        "csv": "CSV exportieren"
      },
      "totalShown": "im Zeitraum angezeigt"
```

Replace the existing `"totalShown": "insgesamt angezeigt (max. 50)"` line in de.json with the new value above (the `50` hardcode is no longer accurate).

- [ ] **Step 3: Validate JSON and TypeScript**

Run: `npm run check`
Expected: PASS.

Run (ad-hoc JSON sanity check):
```bash
node -e "JSON.parse(require('fs').readFileSync('client/src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('client/src/i18n/locales/de.json','utf8')); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Manual language QA**

With `npm run dev` running, open `/business/marketing` → Leads tab and switch between EN and DE (via the existing language picker). Verify every string on the tab — tiles, chart titles, status pills, filter pills, table headers, empty-state, "Load more", "Export CSV" — flips correctly. No mixed-language text remains.

- [ ] **Step 5: Commit**

```bash
git add client/src/i18n/locales/en.json client/src/i18n/locales/de.json
git commit -m "i18n(leads): fill missing EN keys and add stats/charts/filter/export keys (EN+DE)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full TypeScript check**

Run: `npm run check`
Expected: PASS, no new errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS. The three new test files (`leads-metrics-query.test.ts`, `leads-list-filters.test.ts`, `leads-csv-export.test.ts`) run green; no existing tests regress.

- [ ] **Step 3: End-to-end manual check in the browser**

With `npm run dev`, walk through `/business/marketing` → Leads one more time in both EN and DE. Confirm every item in the spec's "Testing — manual QA" checklist:
  (a) EN ↔ DE flips every string cleanly.
  (b) Status pills reset the list and re-fetch; "Load more…" disappears after the last page.
  (c) Changing Von/Bis re-drives stats, list, and the CSV download URL.
  (d) Source column renders Instagram/Facebook/Globe icons with tooltips; unknown source falls back to Globe.
  (e) CSV opens in Excel with proper UTF-8 characters and the documented column order.

- [ ] **Step 4: Report**

If everything passes, the feature is ready for code review. If any of the three checks fails, stop and fix the specific issue — do not bypass.

---

## Self-Review

**Spec coverage** — every section of the spec maps to a task:
- i18n fix (spec §User-approved #1) → Task 8
- Source icons (#2) → Task 1 (shared module) + Task 7 (use in table)
- Load-more pagination (#3) → Task 4 (server `from`/`to`) + Task 7 (client `before=`)
- Conversion A+C metric (#4), Von/Bis scope (#5), monthly bucket (#6) → Task 2 (service) + Task 3 (route) + Task 6 (component)
- Extras A/C/D/F (#7) → Task 7 (pills) + Task 6 (total + avg-days tiles) + Task 5 (CSV) + Task 7 (wire export anchor)
- Error handling → Task 6 shows `"—"` on error; Task 5 handler logs + returns 500
- Tests — `leads-stats`, `leads-list`, `leads-export` → Tasks 2, 4, 5 respectively

**Placeholder scan** — no TBDs, no "similar to Task N", every code block is complete.

**Type consistency** — `LeadStatus` enum literal matches between server (`leadStatusEnum`), route handler filter, client `STATUS_FILTERS`, and `LeadStatusPill` mapping. `LeadsStats` interface fields match between service return type, route JSON, and client `useQuery` generic. `LeadCsvRow` shape matches the server query select columns passed to `buildLeadsCsv`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-marketing-leads-tab-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
