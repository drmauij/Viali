# Source Insights Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/business/funnels` Source insights card so the existing "Referral Sources Over Time" chart becomes the week-over-week monitoring tool needed after the recent ads-balance change; add an avg/day headline number and a weekday-peaks bar chart; fix the donut legend overlap and the muted card-title contrast bug.

**Architecture:** One new read endpoint `/api/business/:hospitalId/referral-daily` (+ chain mirror) returning gap-free daily-by-source rows. Client rolls the same daily data up to Week / Month / Day grain client-side, derives the weekday averages, and computes avg/day from the existing `referral-stats` total. Donut legend overlap and chart-card title contrast are two small layout/CSS fixes in the same component pass.

**Tech Stack:** Postgres + Drizzle ORM, Express, React + TanStack Query, Recharts, Tailwind, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-05-16-referral-daily-avg-and-weekday-peaks-design.md`

---

## File Structure

**Server**
- Modify `server/lib/referralAnalytics.ts` — add `getReferralDailyBySource()` helper next to the existing `getReferralStats` / `getReferralTimeseries`.
- Modify `server/routes/business.ts` — add `GET /api/business/:hospitalId/referral-daily`.
- Modify `server/routes/chain.ts` — add `GET /api/chain/:groupId/referral-daily`.

**Client**
- Modify `client/src/components/funnels/ReferralEventsTab.tsx` — new query, derived data, grain toggle, MA overlay, weekday chart, avg/day inline, legend layout fix, chart-card title contrast fix.
- Modify `client/src/i18n/locales/*.json` — new keys (English + every locale that ships with the project; add the strings, no missing-key warnings).

**Tests**
- Create `tests/referral-analytics-daily.test.ts` — backend helper + route smoke tests.
- Create `tests/funnels/referral-events-tab-source-insights.test.tsx` — component-level tests for rollup math, weekday math, avg/day math, donut-click → MA visibility.

---

## Task 1: Backend helper — `getReferralDailyBySource` (returns gap-free daily-by-source rows)

**Files:**
- Modify: `server/lib/referralAnalytics.ts`
- Test: `tests/referral-analytics-daily.test.ts`

This task adds the core SQL aggregation. The helper takes `hospitalIds`, optional `from`/`to`, resolves the bucketing timezone, runs one query that groups events by (day, source), folds the triples into one row per day, and pads zero-count days with `generate_series`.

- [ ] **Step 1: Write the failing test — gap-free padding**

Create `tests/referral-analytics-daily.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  patients,
  patientHospitals,
  referralEvents,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";
import { getReferralDailyBySource } from "../server/lib/referralAnalytics";

const uniq = () => randomUUID().slice(0, 8);

let hospId: string;
let patId: string;

const createdHospitalIds: string[] = [];
const createdPatientIds: string[] = [];
const createdReferralIds: string[] = [];

async function mkReferral(hospitalId: string, patientId: string, source: string, createdAt: Date) {
  const [r] = await db
    .insert(referralEvents)
    .values({
      hospitalId,
      patientId,
      source: source as any,
      captureMethod: "manual",
      createdAt,
    } as any)
    .returning();
  createdReferralIds.push(r.id);
  return r.id;
}

beforeAll(async () => {
  const [h] = await db
    .insert(hospitals)
    .values({ name: `RDS-${uniq()}`, timezone: "Europe/Zurich" } as any)
    .returning();
  hospId = h.id;
  createdHospitalIds.push(hospId);

  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: hospId,
      patientNumber: `RDS-${uniq()}`,
      surname: "Test",
      firstName: "Patient",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: false,
    } as any)
    .returning();
  patId = p.id;
  createdPatientIds.push(patId);
  await ensurePatientHospitalLink(patId, hospId, null);
});

beforeEach(async () => {
  // Wipe any referrals between tests so each test starts clean
  if (createdReferralIds.length) {
    await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds));
    createdReferralIds.length = 0;
  }
});

afterAll(async () => {
  if (createdReferralIds.length)
    await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds));
  await db.delete(patientHospitals).where(inArray(patientHospitals.patientId, createdPatientIds));
  await db.delete(patients).where(inArray(patients.id, createdPatientIds));
  await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds));
  await pool.end();
});

describe("getReferralDailyBySource", () => {
  it("returns a gap-free row for every calendar day in [from, to], padding empty days with total=0", async () => {
    // Insert events on day 1 and day 3 of a 5-day window; day 2, 4, 5 should be zero rows.
    await mkReferral(hospId, patId, "social", new Date("2026-05-01T10:00:00Z"));
    await mkReferral(hospId, patId, "search_engine", new Date("2026-05-03T10:00:00Z"));

    const result = await getReferralDailyBySource([hospId], {
      from: "2026-05-01",
      to: "2026-05-05",
    });

    expect(result.rows).toHaveLength(5);
    expect(result.rows.map((r) => r.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
    ]);
    expect(result.rows[0]!.total).toBe(1);
    expect(result.rows[0]!.bySource.social).toBe(1);
    expect(result.rows[1]!.total).toBe(0);
    expect(result.rows[1]!.bySource).toEqual({});
    expect(result.rows[2]!.bySource.search_engine).toBe(1);
    expect(result.rows[4]!.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/referral-analytics-daily.test.ts -t "gap-free row"`
Expected: FAIL with `getReferralDailyBySource is not a function` (or similar import error).

- [ ] **Step 3: Implement the helper**

Append to `server/lib/referralAnalytics.ts` (below the existing `getReferralTimeseries` block, above `listReferralEvents`):

```ts
// ---------------------------------------------------------------------------
// referral-daily — daily-by-source counts with gap-free padding
// ---------------------------------------------------------------------------

export interface ReferralDailyRow {
  date: string;                     // 'YYYY-MM-DD' in the bucketing timezone
  total: number;
  bySource: Record<string, number>;
}

export interface ReferralDailyResult {
  rows: ReferralDailyRow[];
  sources: string[];
  timezone: string;
}

export class ReferralDailyRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferralDailyRangeError";
  }
}

const MAX_DAILY_RANGE_DAYS = 366;

export async function getReferralDailyBySource(
  hospitalIds: string[],
  opts: { from?: string; to?: string } = {},
): Promise<ReferralDailyResult> {
  // 1. Resolve the bucketing timezone. All hospitals in scope share one tz =>
  //    use it; mixed tz => UTC.
  const tzRows = await db
    .select({ tz: hospitals.timezone })
    .from(hospitals)
    .where(hospitalScopeClause(hospitals.id, hospitalIds));
  const distinctTz = new Set(tzRows.map((r) => r.tz || "UTC"));
  const timezone = distinctTz.size === 1 ? [...distinctTz][0]! : "UTC";

  // 2. Resolve [from, to] with defaults: to = now, from = to - 90d.
  const toDate = opts.to ? new Date(opts.to) : new Date();
  const fromDate = opts.from
    ? new Date(opts.from)
    : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new ReferralDailyRangeError("invalid from/to");
  }
  const rangeDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
  if (rangeDays > MAX_DAILY_RANGE_DAYS) {
    throw new ReferralDailyRangeError(`range exceeds ${MAX_DAILY_RANGE_DAYS} days`);
  }
  if (rangeDays < 0) {
    throw new ReferralDailyRangeError("from is after to");
  }

  // 3. One query: generate_series LEFT JOIN grouped events.
  //    The bucketing is `to_char(re.created_at AT TIME ZONE $tz, 'YYYY-MM-DD')`.
  const result = await db.execute(sql`
    WITH days AS (
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day
      FROM generate_series(
        ${fromDate.toISOString().slice(0, 10)}::date,
        ${toDate.toISOString().slice(0, 10)}::date,
        '1 day'
      ) AS d
    ),
    events AS (
      SELECT
        to_char(re.created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
        re.source AS source,
        count(*)::int AS count
      FROM referral_events re
      WHERE ${hospitalIds.length === 1
        ? sql`re.hospital_id = ${hospitalIds[0]}`
        : sql`re.hospital_id IN (${sql.join(hospitalIds.map((id) => sql`${id}`), sql`, `)})`}
        AND re.created_at >= ${fromDate.toISOString()}::timestamp
        AND re.created_at <= ${toDate.toISOString()}::timestamp
      GROUP BY 1, 2
    )
    SELECT
      d.day AS date,
      e.source AS source,
      COALESCE(e.count, 0) AS count
    FROM days d
    LEFT JOIN events e ON e.day = d.day
    ORDER BY d.day ASC, e.source ASC NULLS LAST
  `);

  // 4. Fold flat rows into one row per day.
  const rowMap = new Map<string, ReferralDailyRow>();
  const totals: Record<string, number> = {};
  for (const r of result.rows as Array<{ date: string; source: string | null; count: number }>) {
    let row = rowMap.get(r.date);
    if (!row) {
      row = { date: r.date, total: 0, bySource: {} };
      rowMap.set(r.date, row);
    }
    if (r.source && r.count > 0) {
      row.bySource[r.source] = (row.bySource[r.source] ?? 0) + r.count;
      row.total += r.count;
      totals[r.source] = (totals[r.source] ?? 0) + r.count;
    }
  }
  const rows = [...rowMap.values()];
  const sources = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  return { rows, sources, timezone };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/referral-analytics-daily.test.ts -t "gap-free row"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/referralAnalytics.ts tests/referral-analytics-daily.test.ts
git commit -m "feat(referrals): getReferralDailyBySource — gap-free daily-by-source counts"
```

---

## Task 2: Backend helper — source bucketing, sources ordering, hospital scoping, range cap

**Files:**
- Modify: `tests/referral-analytics-daily.test.ts`

Adds the rest of the backend coverage in one go (same SUT, same fixtures).

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("getReferralDailyBySource", () => { ... })` block:

```ts
it("buckets counts by source within each day", async () => {
  const day = new Date("2026-05-10T10:00:00Z");
  await mkReferral(hospId, patId, "social", day);
  await mkReferral(hospId, patId, "social", day);
  await mkReferral(hospId, patId, "search_engine", day);

  const result = await getReferralDailyBySource([hospId], {
    from: "2026-05-10",
    to: "2026-05-10",
  });

  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]!.total).toBe(3);
  expect(result.rows[0]!.bySource).toEqual({ social: 2, search_engine: 1 });
});

it("sorts the sources array by descending total across the range", async () => {
  await mkReferral(hospId, patId, "social", new Date("2026-05-11T10:00:00Z"));
  await mkReferral(hospId, patId, "social", new Date("2026-05-12T10:00:00Z"));
  await mkReferral(hospId, patId, "search_engine", new Date("2026-05-11T10:00:00Z"));
  await mkReferral(hospId, patId, "marketing", new Date("2026-05-12T10:00:00Z"));
  await mkReferral(hospId, patId, "marketing", new Date("2026-05-12T11:00:00Z"));
  await mkReferral(hospId, patId, "marketing", new Date("2026-05-12T12:00:00Z"));

  const result = await getReferralDailyBySource([hospId], {
    from: "2026-05-11",
    to: "2026-05-12",
  });

  // marketing 3 > social 2 > search_engine 1
  expect(result.sources).toEqual(["marketing", "social", "search_engine"]);
});

it("excludes events from hospitals not in the scope list", async () => {
  // Insert another hospital + patient + event, confirm it's not counted.
  const [h2] = await db
    .insert(hospitals)
    .values({ name: `RDS-other-${uniq()}`, timezone: "Europe/Zurich" } as any)
    .returning();
  createdHospitalIds.push(h2.id);
  const [p2] = await db
    .insert(patients)
    .values({
      hospitalId: h2.id,
      patientNumber: `RDS-other-${uniq()}`,
      surname: "Other",
      firstName: "Other",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: false,
    } as any)
    .returning();
  createdPatientIds.push(p2.id);
  await ensurePatientHospitalLink(p2.id, h2.id, null);

  await mkReferral(h2.id, p2.id, "social", new Date("2026-05-20T10:00:00Z"));

  const result = await getReferralDailyBySource([hospId], {
    from: "2026-05-20",
    to: "2026-05-20",
  });

  expect(result.rows[0]!.total).toBe(0);
});

it("rejects ranges greater than 366 days", async () => {
  await expect(
    getReferralDailyBySource([hospId], {
      from: "2024-01-01",
      to: "2026-01-01",
    }),
  ).rejects.toThrow(/range exceeds/);
});

it("defaults to last 90 days when 'from' is omitted", async () => {
  const result = await getReferralDailyBySource([hospId], { to: "2026-05-31" });
  expect(result.rows.length).toBeGreaterThanOrEqual(91);
  expect(result.rows[0]!.date).toBe("2026-03-02");
  expect(result.rows[result.rows.length - 1]!.date).toBe("2026-05-31");
});
```

- [ ] **Step 2: Run tests to verify the new ones fail (then pass with current impl)**

Run: `npx vitest run tests/referral-analytics-daily.test.ts`
Expected: All five new tests pass against the implementation from Task 1. If any fail, fix the helper before continuing — the impl was designed to satisfy them but the test is the contract.

- [ ] **Step 3: Commit**

```bash
git add tests/referral-analytics-daily.test.ts
git commit -m "test(referrals): cover source bucketing, ordering, scope, range cap, default from"
```

---

## Task 3: Route — `GET /api/business/:hospitalId/referral-daily`

**Files:**
- Modify: `server/routes/business.ts`
- Test: `tests/referral-analytics-daily.test.ts` (extend)

- [ ] **Step 1: Write the failing route test**

Append to `tests/referral-analytics-daily.test.ts` (top of file additions: bring in `express`, `supertest`, the router, and `vi`; add a marketing-or-manager user fixture). At the top of the file, alongside the existing imports:

```ts
import express from "express";
import request from "supertest";
import { vi } from "vitest";
import { users, userHospitalRoles, units } from "@shared/schema";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import businessRouter from "../server/routes/business";
```

Below `mkReferral`, add fixture helpers:

```ts
let managerUserId: string;
let unitId: string;
const createdUserIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(businessRouter);
  return app;
}
```

Inside `beforeAll`, after the existing patient setup:

```ts
const [u] = await db
  .insert(units)
  .values({ hospitalId: hospId, name: "u", type: "clinic" } as any)
  .returning();
unitId = u.id;
createdUnitIds.push(unitId);

const [usr] = await db
  .insert(users)
  .values({
    id: `mgr-${uniq()}`,
    email: `mgr-${uniq()}@test.invalid`,
    firstName: "Mgr",
    lastName: "User",
    isPlatformAdmin: false,
  } as any)
  .returning();
managerUserId = usr.id;
createdUserIds.push(managerUserId);

const [r] = await db
  .insert(userHospitalRoles)
  .values({ userId: managerUserId, hospitalId: hospId, unitId, role: "manager" } as any)
  .returning();
createdRoleIds.push(r.id);
```

Add to `afterAll` (before the existing patient/hospital cleanup):

```ts
if (createdRoleIds.length)
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds));
if (createdUnitIds.length)
  await db.delete(units).where(inArray(units.id, createdUnitIds));
if (createdUserIds.length)
  await db.delete(users).where(inArray(users.id, createdUserIds));
```

Then add a new `describe` block at the bottom of the file:

```ts
describe("GET /api/business/:hospitalId/referral-daily", () => {
  it("returns gap-free daily-by-source rows for the authorized hospital", async () => {
    await mkReferral(hospId, patId, "social", new Date("2026-06-01T10:00:00Z"));
    const app = buildApp(managerUserId);
    const res = await request(app).get(
      `/api/business/${hospId}/referral-daily?from=2026-06-01&to=2026-06-02`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rows: expect.any(Array),
      sources: expect.any(Array),
      timezone: expect.any(String),
    });
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0].bySource.social).toBe(1);
    expect(res.body.rows[1].total).toBe(0);
    expect(res.body.sources).toEqual(["social"]);
  });

  it("returns 400 when range exceeds 366 days", async () => {
    const app = buildApp(managerUserId);
    const res = await request(app).get(
      `/api/business/${hospId}/referral-daily?from=2024-01-01&to=2026-01-01`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user has no access to the hospital", async () => {
    // Other hospital with no role for this user
    const [h2] = await db
      .insert(hospitals)
      .values({ name: `RDS-noaccess-${uniq()}`, timezone: "Europe/Zurich" } as any)
      .returning();
    createdHospitalIds.push(h2.id);
    const app = buildApp(managerUserId);
    const res = await request(app).get(
      `/api/business/${h2.id}/referral-daily?from=2026-06-01&to=2026-06-02`,
    );
    expect([401, 403, 404]).toContain(res.status); // exact status depends on existing middleware
  });
});
```

- [ ] **Step 2: Run test to verify it fails (route not registered)**

Run: `npx vitest run tests/referral-analytics-daily.test.ts -t "GET /api/business"`
Expected: FAIL with `404` on the first test (route not registered).

- [ ] **Step 3: Add the route**

In `server/routes/business.ts`, right after the existing `referral-timeseries` route block (around line 2001), add:

```ts
// Referral source daily-by-source counts (powers the upgraded
// "Referral Sources Over Time" line chart + weekday peaks bar).
router.get('/api/business/:hospitalId/referral-daily', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    try {
      const result = await getReferralDailyBySource(hospitalIds, {
        from: from as string | undefined,
        to: to as string | undefined,
      });
      res.json(result);
    } catch (err: any) {
      if (err?.name === "ReferralDailyRangeError") {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  } catch (error: any) {
    logger.error('Error fetching referral daily-by-source:', error);
    res.status(500).json({ message: 'Failed to fetch referral daily-by-source' });
  }
});
```

Also update the imports at the top of the file: find the existing `import { getReferralStats, getReferralTimeseries, listReferralEvents, ... } from "../lib/referralAnalytics";` line and add `getReferralDailyBySource` to it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/referral-analytics-daily.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/business.ts tests/referral-analytics-daily.test.ts
git commit -m "feat(referrals): add GET /api/business/:hospitalId/referral-daily"
```

---

## Task 4: Route — chain mirror `/api/chain/:groupId/referral-daily`

**Files:**
- Modify: `server/routes/chain.ts`

This mirrors the business route for group-scope dashboards. Smoke test re-uses the helper test (already covered in Task 2). No new fixture — `chain-funnels-endpoints.test.ts` is the existing template if dedicated route coverage is wanted later, but per Spec Open-Question 2 we're not adding it now.

- [ ] **Step 1: Add the chain route**

In `server/routes/chain.ts`, right after the existing `referral-timeseries` chain handler (around line 1232), add:

```ts
chainRouter.get('/api/chain/:groupId/referral-daily', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const { ids } = await resolveHospitalIds(groupId, req.query.hospitalIds);
    if (ids.length === 0) return res.json({ rows: [], sources: [], timezone: "UTC" });
    try {
      const result = await getReferralDailyBySource(ids, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.json(result);
    } catch (err: any) {
      if (err?.name === "ReferralDailyRangeError") {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  } catch (e: any) {
    if (e instanceof ChainAuthError) return res.status(e.status).json({ message: e.message });
    logger.error("Error fetching chain referral-daily:", e);
    res.status(500).json({ message: "Failed to fetch chain referral-daily" });
  }
});
```

Also update the imports at the top of `chain.ts`: find the existing import from `../lib/referralAnalytics` and add `getReferralDailyBySource`.

- [ ] **Step 2: Run typecheck to catch import / type issues**

Run: `npm run check`
Expected: PASS with no new errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/chain.ts
git commit -m "feat(referrals): add GET /api/chain/:groupId/referral-daily mirror"
```

---

## Task 5: i18n — add the new keys

**Files:**
- Modify: every locale file in `client/src/i18n/locales/`.

This task is its own commit so the component edits in later tasks don't trip on missing keys (which would emit console warnings even though the `t()` fallback would still render).

- [ ] **Step 1: Identify locale files**

Run: `ls client/src/i18n/locales/`
Expected: a list of `*.json` files (probably `en.json`, `de.json`, possibly more).

- [ ] **Step 2: Add the keys to each locale**

For each locale file (English values shown — translate to each language; if uncertain, use the English fallback and flag for translation in the commit message):

```json
{
  "business": {
    "referrals": {
      "avgPerDayShort": "/day avg",
      "weekdayPeaks": "Weekday peaks",
      "weekdayPeaksHelp": "Average referrals per day for each weekday across the selected range. Stacked by source — click a slice in 'How patients found us' to isolate one.",
      "rangeTooWide": "Range too wide for daily detail — narrow the date filter to see this chart.",
      "grain": {
        "week": "Week",
        "month": "Month",
        "day": "Day"
      }
    }
  },
  "common": {
    "weekday": {
      "mon": "Mon",
      "tue": "Tue",
      "wed": "Wed",
      "thu": "Thu",
      "fri": "Fri",
      "sat": "Sat",
      "sun": "Sun"
    }
  }
}
```

If `common.weekday.*` already exists in any locale, do not overwrite. Use `grep -n "weekday" client/src/i18n/locales/*.json` to check first; merge instead of duplicate.

- [ ] **Step 3: Run typecheck to catch any JSON parse breakage**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/locales/
git commit -m "i18n(referrals): add keys for grain toggle, weekday peaks, avg/day"
```

---

## Task 6: Component fix — `ChartCard` title contrast

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx` (lines around 172–186, the `ChartCard` sub-component)

The card title currently renders at `text-muted-foreground` opacity on dark backgrounds because `CardTitle` from shadcn defaults inherit that token in some theme combinations. Force foreground.

- [ ] **Step 1: Inspect the current title line**

Run: `grep -n "CardTitle className=\"text-lg\"" client/src/components/funnels/ReferralEventsTab.tsx`
Expected: one match at the `ChartCard` definition.

- [ ] **Step 2: Update the className**

Edit `client/src/components/funnels/ReferralEventsTab.tsx`. Find:

```tsx
<CardTitle className="text-lg">{title}</CardTitle>
```

Replace with:

```tsx
<CardTitle className="text-lg text-foreground">{title}</CardTitle>
```

- [ ] **Step 3: Smoke-check rendering manually**

Run: `npm run dev` (in a separate terminal — leave it running for the next tasks).
Navigate to `/business/funnels` → Referrals tab → expand Source insights. Confirm "Referral Sources Over Time", "How patients found us", and "Detail breakdown" titles render with full foreground contrast (no longer muted).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "fix(funnels): ChartCard title uses text-foreground for dark-mode contrast"
```

---

## Task 7: Component fix — donut legend overlap

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx` (the `<PieChart>` block around lines 517–558)

With 6+ sources the legend wraps and the wrapper pushes the pie up so labels overlap the slices. Fix by giving the legend its own band below the pie and bumping the container height.

- [ ] **Step 1: Inspect the current PieChart block**

Open `client/src/components/funnels/ReferralEventsTab.tsx` and locate the donut block: `<ResponsiveContainer width="100%" height={300}>` followed by `<PieChart>`.

- [ ] **Step 2: Apply the layout fix**

Edit the block:

```tsx
<ResponsiveContainer width="100%" height={300}>
```

becomes:

```tsx
<ResponsiveContainer width="100%" height={360}>
```

And the `<Legend>` element:

```tsx
<Legend
  formatter={(value: string) => {
```

becomes:

```tsx
<Legend
  verticalAlign="bottom"
  wrapperStyle={{ paddingTop: 12, maxHeight: 96, overflowY: "auto" }}
  formatter={(value: string) => {
```

(Leave the `formatter` body unchanged.)

- [ ] **Step 3: Manual smoke check**

In the dev server tab, reload `/business/funnels` → Referrals. With the 192-referral-per-screenshot dataset, the legend should sit below the donut without overlapping the slices. With fewer sources (small dataset), the layout should look unchanged or with slightly more breathing room.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "fix(funnels): donut legend renders below pie, no overlap at 6+ sources"
```

---

## Task 8: Client query — fetch `referral-daily`

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx`

This task wires the new endpoint into the component without yet rendering anything new. Later tasks consume the data.

- [ ] **Step 1: Add the type declarations**

In `client/src/components/funnels/ReferralEventsTab.tsx`, in the `// ─── Types ───` section near the top (after `type ReferralEvent`), add:

```ts
type ReferralDailyRow = {
  date: string;          // 'YYYY-MM-DD'
  total: number;
  bySource: Record<string, number>;
};

type ReferralDailyResult = {
  rows: ReferralDailyRow[];
  sources: string[];
  timezone: string;
  rangeTooWide?: boolean; // set client-side when the server returns 400
                          // so the UI can render the inline guidance message
                          // instead of a generic empty state.
};
```

- [ ] **Step 2: Add the React-Query call**

Find the existing `const timeseriesUrl = funnelsUrl("referral-timeseries", scope);` block. Right after it, add:

```ts
const dailyUrl = funnelsUrl("referral-daily", scope, { from, to });
const { data: referralDaily, isLoading: referralDailyLoading } = useQuery<ReferralDailyResult>({
  queryKey: [dailyUrl],
  enabled: !!dailyUrl,
  queryFn: async () => {
    if (!dailyUrl) throw new Error("scope not addressable");
    const res = await fetch(dailyUrl, { credentials: "include" });
    if (!res.ok) {
      if (res.status === 400) {
        // Range too wide — flag for the inline guidance message in the UI.
        return { rows: [], sources: [], timezone: "UTC", rangeTooWide: true };
      }
      throw new Error("Failed to fetch referral-daily");
    }
    return (await res.json()) as ReferralDailyResult;
  },
});
```

The 400 swallow is intentional: when the range exceeds 366 days the chart shows an inline "narrow the filter" message, not an error toast. We still surface non-400 errors.

- [ ] **Step 3: Verify the query fires**

In the dev server tab, open `/business/funnels` → Referrals tab → Source insights. Open the network panel and confirm a request to `/api/business/<id>/referral-daily?from=…&to=…` returns 200 with the expected shape.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "feat(funnels): fetch referral-daily in Source insights"
```

---

## Task 9: Client — `avgPerDay` headline number

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx`

Adds the inline `/day avg` next to the existing `{totalReferrals} total booking referrals` line. No new fetch — `totalReferrals` already comes from `referral-stats`.

- [ ] **Step 1: Compute `daysInRange` and `avgPerDay`**

In the `// ── Derived data ───` block (around line 393), before `referralLineData`, add:

```ts
const daysInRange = useMemo(() => {
  if (from && to) {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
  }
  return referralDaily?.rows.length ?? 0;
}, [from, to, referralDaily]);

const avgPerDay = useMemo(() => {
  if (!referralData || daysInRange <= 0) return null;
  return referralData.totalReferrals / daysInRange;
}, [referralData, daysInRange]);
```

- [ ] **Step 2: Extend the sample-size line**

Find the current block (around line 496–500):

```tsx
{referralData && (
  <div className="text-sm text-muted-foreground px-1">
    {referralData.totalReferrals} {t("business.referrals.totalBookingReferrals")}
  </div>
)}
```

Replace with:

```tsx
{referralData && (
  <div className="text-sm text-muted-foreground px-1">
    {referralData.totalReferrals} {t("business.referrals.totalBookingReferrals")}
    {avgPerDay !== null && (
      <>
        {" · "}
        <span className="font-medium text-foreground">{avgPerDay.toFixed(1)}</span>{" "}
        {t("business.referrals.avgPerDayShort", "/day avg")}
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Manual smoke check**

Reload `/business/funnels`. With 192 referrals over ~90 days the line should read `192 total booking referrals · 2.1 /day avg`. With 8 referrals over 30 days it should read `8 total booking referrals · 0.3 /day avg`. With an empty range it should hide the avg portion.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "feat(funnels): avg referrals/day inline next to total"
```

---

## Task 10: Client — grain toggle (Week / Month / Day) + `periodSeries` rollup

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx`

Adds the W/M/D state and the client-side rollup that aggregates daily rows into the chosen grain.

- [ ] **Step 1: Add `grain` state and helper functions**

Near the other `useState` calls (around line 233), add:

```ts
type Grain = "week" | "month" | "day";
const [grain, setGrain] = useState<Grain>("week");
```

Just above the `// ─── Constants ───` section header (top of file, after imports), add the period-key helpers:

```ts
// Returns the period key (YYYY-MM-DD for day, ISO Monday-start week 'YYYY-MM-DD'
// for week, 'YYYY-MM' for month).
function periodKey(dateStr: string, grain: Grain): string {
  if (grain === "day") return dateStr;
  const d = new Date(dateStr + "T00:00:00Z");
  if (grain === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // week: Monday-anchored. JS getUTCDay: 0=Sun..6=Sat. We want 0=Mon..6=Sun.
  const isoDow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - isoDow);
  return monday.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Compute `periodSeries`**

In the `// ── Derived data ───` block, right after the `avgPerDay` memo from Task 9, add:

```ts
const periodSeries = useMemo(() => {
  if (!referralDaily?.rows.length) return [];
  const sources = referralDaily.sources;

  // Roll up daily rows into period buckets.
  const buckets = new Map<string, { period: string; bySource: Record<string, number>; total: number }>();
  for (const row of referralDaily.rows) {
    const key = periodKey(row.date, grain);
    let b = buckets.get(key);
    if (!b) {
      b = { period: key, bySource: {}, total: 0 };
      buckets.set(key, b);
    }
    for (const src of sources) {
      const v = row.bySource[src] ?? 0;
      if (v) b.bySource[src] = (b.bySource[src] ?? 0) + v;
    }
    b.total += row.total;
  }
  const orderedKeys = [...buckets.keys()].sort();

  // For each bucket, project bySource into top-level keys (Recharts needs flat shape)
  // and compute `focused` for the selected source (or null if nothing selected).
  const flat = orderedKeys.map((k) => {
    const b = buckets.get(k)!;
    const flatRow: Record<string, number | string | null> = { period: b.period, total: b.total };
    for (const src of sources) flatRow[src] = b.bySource[src] ?? 0;
    flatRow.focused = selectedReferralSource ? (b.bySource[selectedReferralSource] ?? 0) : null;
    return flatRow;
  });

  // Trailing 7-period moving average of `focused`. Only meaningful when a source is selected.
  if (selectedReferralSource) {
    for (let i = 0; i < flat.length; i++) {
      const start = Math.max(0, i - 6);
      const window = flat.slice(start, i + 1);
      const sum = window.reduce((s, r) => s + (r.focused as number), 0);
      flat[i]!.ma7 = sum / window.length;
    }
  } else {
    for (const r of flat) r.ma7 = null;
  }
  return flat;
}, [referralDaily, grain, selectedReferralSource]);
```

- [ ] **Step 3: Smoke-check the rollup**

In the dev server tab, open `/business/funnels` and verify the existing "Referral Sources Over Time" chart still renders (it's still pointing at `referralLineData`, which we'll swap in Task 11). No visual change yet expected — this task only sets up the data.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "feat(funnels): grain (W/M/D) state + periodSeries rollup w/ focused MA"
```

---

## Task 11: Client — swap the line chart data source + add grain toggle UI + MA overlay

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx`

This is the biggest UI change: the existing monthly chart becomes the upgraded chart.

- [ ] **Step 1: Update the import**

At the top of the file, add `ToggleGroup, ToggleGroupItem` next to the other UI imports:

```ts
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
```

- [ ] **Step 2: Replace the chart block**

Find the existing block starting with `{/* Referral progress over time — line chart */}` and the `<ChartCard>` that wraps it. Replace the entire `<ChartCard>...</ChartCard>` invocation with:

```tsx
{/* Referral sources over time — upgraded: grain toggle + filter-aware + focused MA */}
<Card>
  <CardHeader className="flex flex-row items-center justify-between py-3 space-y-0">
    <div className="flex items-center">
      <CardTitle className="text-lg text-foreground">
        {t("business.referrals.progressOverTime")}
      </CardTitle>
      <HelpTooltip content={t("business.referrals.progressOverTimeHelp")} />
      {referralDaily?.timezone === "UTC" && referralDaily.rows.length > 0 && (
        <span className="ml-2 text-xs text-muted-foreground">(UTC)</span>
      )}
    </div>
    <ToggleGroup
      type="single"
      size="sm"
      value={grain}
      onValueChange={(v) => v && setGrain(v as Grain)}
      className="gap-0"
    >
      <ToggleGroupItem value="week" aria-label="Week">
        {t("business.referrals.grain.week", "Week")}
      </ToggleGroupItem>
      <ToggleGroupItem value="month" aria-label="Month">
        {t("business.referrals.grain.month", "Month")}
      </ToggleGroupItem>
      <ToggleGroupItem value="day" aria-label="Day">
        {t("business.referrals.grain.day", "Day")}
      </ToggleGroupItem>
    </ToggleGroup>
  </CardHeader>
  <CardContent>
    {referralDailyLoading ? (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    ) : referralDaily?.rangeTooWide ? (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm px-6 text-center">
        {t("business.referrals.rangeTooWide")}
      </div>
    ) : !referralDaily || referralDaily.rows.length === 0 ? (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t("business.referrals.noData")}
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={periodSeries}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <RechartsTooltip />
          <Legend />
          {referralDaily.sources.map((src) => (
            <Line
              key={src}
              type="monotone"
              dataKey={src}
              name={REFERRAL_LABELS[src] || src}
              stroke={REFERRAL_COLORS[src] || "#6b7280"}
              strokeWidth={selectedReferralSource === src ? 3 : 2}
              strokeOpacity={
                selectedReferralSource && selectedReferralSource !== src ? 0.25 : 1
              }
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
          {selectedReferralSource && (
            <Line
              type="monotone"
              dataKey="ma7"
              name={`${REFERRAL_LABELS[selectedReferralSource] || selectedReferralSource} (7-period avg)`}
              stroke="#ffffff"
              strokeOpacity={0.7}
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 3: Remove the now-unused monthly chart derivations**

The original `referralLineData` and `referralLineSources` memos and the `referralTimeseries` query are no longer used by the chart. **Leave them in place for one release** — they still feed nothing and the legacy `referral-timeseries` endpoint still works, but a follow-up PR can rip them out once we've confirmed nothing else consumes them. Add this single-line comment above the existing `referralLineData` memo:

```ts
// LEGACY: superseded by `periodSeries` (Task 10). Safe to remove next release.
```

(Keeping rip-out as a follow-up minimizes blast radius on a feature commit.)

- [ ] **Step 4: Manual smoke check — all four states**

Reload `/business/funnels` → Referrals → Source insights. Verify each scenario:

1. **Default Week grain, no source selected.** The chart shows one line per source, color-matched to the donut. No MA line. X-axis has continuous weekly buckets (no skipped weeks). All lines render at full opacity.
2. **Click a donut slice (e.g. Search Engine).** The non-Search-Engine lines dim to 25% opacity. The Search Engine line bolds (strokeWidth 3). A dashed white MA line appears for Search Engine. Click again to deselect — MA disappears.
3. **Switch to Month grain.** Bucket count drops, X-axis shows `YYYY-MM` keys. With the 90-day default window, you should see ~3–4 buckets. Lines remain.
4. **Switch to Day grain.** Bucket count rises to days-in-range. Lines remain. If the range is > 366 days the chart shows "no data" (because `referralDaily.rows` is empty per Task 8's 400 swallow); narrow the filter and the chart returns.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "feat(funnels): upgrade Referral Sources Over Time — grain toggle, filter-aware, focused MA"
```

---

## Task 12: Client — weekday peaks bar chart

**Files:**
- Modify: `client/src/components/funnels/ReferralEventsTab.tsx`

Adds the new `<Card>` below the upgraded line chart. Bars stacked by source, dims non-selected when a donut slice is active.

- [ ] **Step 1: Import `BarChart`, `Bar` from recharts**

In the top-level recharts import block, add `BarChart, Bar`:

```ts
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from "recharts";
```

- [ ] **Step 2: Compute `weekdayBySource`**

In the `// ── Derived data ───` block, after `periodSeries`, add:

```ts
const weekdayBySource = useMemo(() => {
  const labels: Array<{ key: string; label: string }> = [
    { key: "mon", label: t("common.weekday.mon", "Mon") },
    { key: "tue", label: t("common.weekday.tue", "Tue") },
    { key: "wed", label: t("common.weekday.wed", "Wed") },
    { key: "thu", label: t("common.weekday.thu", "Thu") },
    { key: "fri", label: t("common.weekday.fri", "Fri") },
    { key: "sat", label: t("common.weekday.sat", "Sat") },
    { key: "sun", label: t("common.weekday.sun", "Sun") },
  ];
  if (!referralDaily?.rows.length) {
    return labels.map((l) => ({ ...l, totalAvg: 0 }));
  }
  const sources = referralDaily.sources;
  // count of dates per weekday (denominator)
  const dayCount = [0, 0, 0, 0, 0, 0, 0];
  // sum of counts per (weekday, source)
  const sourceSum: Array<Record<string, number>> = [{}, {}, {}, {}, {}, {}, {}];
  for (const row of referralDaily.rows) {
    const d = new Date(row.date + "T00:00:00Z");
    const dow = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
    dayCount[dow]!++;
    for (const src of sources) {
      const v = row.bySource[src] ?? 0;
      if (v) sourceSum[dow]![src] = (sourceSum[dow]![src] ?? 0) + v;
    }
  }
  return labels.map((l, i) => {
    const denom = dayCount[i] || 1; // avoid /0; bar shows 0 when denom=0
    const avgs: Record<string, number> = {};
    let totalAvg = 0;
    for (const src of sources) {
      const a = (sourceSum[i]![src] ?? 0) / denom;
      avgs[src] = a;
      totalAvg += a;
    }
    return { ...l, totalAvg, ...avgs };
  });
}, [referralDaily, t]);
```

- [ ] **Step 3: Render the chart**

Below the upgraded "Referral Sources Over Time" `<Card>` (from Task 11), before the closing `)}` of `sourceInsightsOpen &&`, add:

```tsx
{/* Weekday peaks — average referrals per weekday in the filtered range */}
<ChartCard
  title={t("business.referrals.weekdayPeaks", "Weekday peaks")}
  helpText={t("business.referrals.weekdayPeaksHelp")}
>
  {referralDailyLoading ? (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ) : referralDaily?.rangeTooWide ? (
    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm px-6 text-center">
      {t("business.referrals.rangeTooWide")}
    </div>
  ) : !referralDaily || referralDaily.rows.length === 0 ? (
    <div className="flex items-center justify-center h-48 text-muted-foreground">
      {t("business.referrals.noData")}
    </div>
  ) : (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={weekdayBySource}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={true} tick={{ fontSize: 12 }} />
        <RechartsTooltip
          formatter={(value: number, name: string) => [
            value.toFixed(2),
            REFERRAL_LABELS[name] || name,
          ]}
        />
        <Legend
          formatter={(value: string) => REFERRAL_LABELS[value] || value}
        />
        {referralDaily.sources.map((src) => (
          <Bar
            key={src}
            dataKey={src}
            stackId="weekday"
            fill={REFERRAL_COLORS[src] || "#6b7280"}
            opacity={
              selectedReferralSource && selectedReferralSource !== src ? 0.25 : 1
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )}
</ChartCard>
```

- [ ] **Step 4: Manual smoke check**

Reload `/business/funnels`. Verify:

1. Weekday peaks bars render Mon → Sun, stacked colored segments per source.
2. Clicking the Search Engine slice in the donut dims all non-Search-Engine stack segments in the weekday chart.
3. Tooltip shows source-labeled lines with 2-decimal averages.
4. With an empty range, the chart shows "no data".

- [ ] **Step 5: Commit**

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "feat(funnels): weekday peaks bar chart, stacked by source, dim on donut focus"
```

---

## Task 13: Component-level tests for rollup, weekday math, avg/day, focus

**Files:**
- Create: `tests/funnels/referral-events-tab-source-insights.test.tsx`

These tests verify the derived-data math without spinning the DB. Mock the React-Query responses; assert on rendered text + recharts content.

- [ ] **Step 1: Write the test scaffold**

Create `tests/funnels/referral-events-tab-source-insights.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";

vi.mock("@/hooks/useActiveHospital", () => ({
  useActiveHospital: () => ({ role: "manager" }),
}));

// Mock recharts so jsdom doesn't have to handle SVG layout. We just verify
// that the right number of <Line>/<Bar> children are passed and the data
// prop matches.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<any>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

import ReferralEventsTab from "@/components/funnels/ReferralEventsTab";

function renderWith({
  stats,
  daily,
  events = { rows: [], total: 0, campaigns: [] },
  timeseries = [],
}: {
  stats: any;
  daily: any;
  events?: any;
  timeseries?: any;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(
    [`/api/business/hosp1/referral-stats?from=2026-05-01&to=2026-05-10`],
    stats,
  );
  qc.setQueryData(
    [`/api/business/hosp1/referral-timeseries`],
    timeseries,
  );
  qc.setQueryData(
    [`/api/business/hosp1/referral-daily?from=2026-05-01&to=2026-05-10`],
    daily,
  );
  qc.setQueryData(
    [
      `/api/business/hosp1/referral-events?limit=50&from=2026-05-01&to=2026-05-10`,
    ],
    events,
  );

  // Force the Source insights card open via localStorage seed.
  localStorage.setItem("marketing.verweise.sourceInsights.open", "true");

  return render(
    <QueryClientProvider client={qc}>
      <ReferralEventsTab
        scope={{ hospitalIds: ["hosp1"] }}
        from="2026-05-01"
        to="2026-05-10"
        currency="CHF"
      />
    </QueryClientProvider>,
  );
}

const baseDaily = {
  rows: [
    // Mon 2026-05-04 — 1 social, 1 search_engine
    { date: "2026-05-04", total: 2, bySource: { social: 1, search_engine: 1 } },
    // Tue 2026-05-05 — 0
    { date: "2026-05-05", total: 0, bySource: {} },
    // Wed 2026-05-06 — 2 social
    { date: "2026-05-06", total: 2, bySource: { social: 2 } },
    // next Mon 2026-05-11 — 3 social
    { date: "2026-05-11", total: 3, bySource: { social: 3 } },
  ],
  sources: ["social", "search_engine"],
  timezone: "Europe/Zurich",
};

describe("Source insights — derived data", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders avg/day = totalReferrals / daysInRange (not rows.length)", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 10 },
      daily: baseDaily,
    });
    // (2026-05-01..2026-05-10) inclusive = 10 days. 10 / 10 = 1.0
    expect(screen.getByText("1.0")).toBeInTheDocument();
  });

  it("renders the avg/day with one decimal even for fractional values", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 7 },
      daily: baseDaily,
    });
    expect(screen.getByText("0.7")).toBeInTheDocument();
  });

  it("hides the avg/day suffix when totalReferrals is missing", () => {
    renderWith({
      stats: null,
      daily: baseDaily,
    });
    expect(screen.queryByText("/day avg")).not.toBeInTheDocument();
  });

  it("renders the upgraded chart title with foreground contrast", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 4 },
      daily: baseDaily,
    });
    const title = screen.getByText("Referral progress over time");
    // From Task 6 + Task 11 — title gets text-foreground
    expect(title.className).toContain("text-foreground");
  });
});
```

- [ ] **Step 2: Run the tests — expect them to pass against current impl**

Run: `npx vitest run tests/funnels/referral-events-tab-source-insights.test.tsx`
Expected: PASS.

If any fails, fix the implementation: the test is the spec.

- [ ] **Step 3: Commit**

```bash
git add tests/funnels/referral-events-tab-source-insights.test.tsx
git commit -m "test(funnels): avg/day + title contrast for upgraded Source insights"
```

---

## Task 14: Typecheck + lint + final smoke

**Files:** none new — verification only.

- [ ] **Step 1: Run typecheck**

Run: `npm run check`
Expected: PASS, no new errors.

If `unused variable` warnings fire on the legacy `referralLineData`/`referralLineSources`/`referralTimeseries` (Task 11 left them in place intentionally), prefix them with `_` to silence the warning or move them behind the comment as commented-out code. Choose whichever the codebase convention favors (check the most recent commits — feedback memory: skip unused-var renames if the codebase tolerates them).

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run tests/referral-analytics-daily tests/funnels/referral-events-tab-source-insights`
Expected: PASS for both files.

Then a broader run to confirm nothing regressed in adjacent referral tests:

Run: `npm test -- --run tests/referral-stats-scope tests/chain-funnels-endpoints tests/referral-events-filters`
Expected: PASS.

- [ ] **Step 3: Manual smoke walkthrough**

With dev server still running, walk through `/business/funnels` → Referrals → Source insights and confirm each of the spec's user-visible changes:

1. Card title contrast — "Referral progress over time", "How patients found us", "Detail breakdown", "Weekday peaks" all render at full foreground.
2. Donut legend overlap — with the 192-referral dataset (production-like), labels sit below the pie, no overlap with slices.
3. Avg/day inline — sample-size line reads `N total booking referrals · X.Y /day avg`.
4. Grain toggle — clicking W / M / D rebuckets the chart smoothly; default is Week.
5. Donut click → focus — clicking a donut slice dims other lines, bolds the focused one, shows a dashed white MA, and dims the non-selected weekday-stack segments.
6. Weekday peaks — Mon → Sun bars stacked by source.
7. Filter awareness — narrowing the page-level from/to date filter narrows all three (donut total + line chart + weekday chart). Widening past 366 days shows the "no data" empty state on the line + weekday charts; donut still renders.
8. Group scope toggle (if available) — `(UTC)` annotation appears next to the line-chart title when crossing TZs.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

If Task 11's legacy `referralLineData`/`referralLineSources` were cleaned up here, commit:

```bash
git add client/src/components/funnels/ReferralEventsTab.tsx
git commit -m "chore(funnels): drop legacy referralLineData after upgraded chart swap"
```

Otherwise no commit needed.

---

## Done criteria

- [ ] All 14 tasks committed in order.
- [ ] `npm run check` passes.
- [ ] `npm test` passes for `referral-analytics-daily.test.ts` and `funnels/referral-events-tab-source-insights.test.tsx`.
- [ ] Manual smoke (Task 14, Step 3) walked through end-to-end on `/business/funnels` against both small (8 referrals) and production-like (192 referrals) data.
- [ ] No new migration. No schema change. Legacy `referral-timeseries` route still present and functional.
