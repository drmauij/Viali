# CLAUDE.md

Read `replit.md` for full project context (architecture, stack, conventions).

## Pre-commit rule: migration idempotency

Before committing or pushing, verify that **all migration files** (in `migrations/` or similar) are idempotent — safe to run multiple times. Every migration must use guards such as `IF NOT EXISTS`, `IF EXISTS`, `DO $$ ... END $$` blocks, or equivalent. Never commit a migration that would fail on a second run.

## Common commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run check` — TypeScript check
- `npm run db:generate` — generate DB migrations
- `npm run db:migrate` — generate + push migrations

## Deployment

Deployed on Exoscale VPS (Ubuntu), not Replit. Use standard environment variables; do not rely on Replit-specific features.

## DB migration workflow

1. Update `shared/schema.ts`
2. `npm run db:generate`
3. Convert generated migration to idempotent SQL (use `IF NOT EXISTS`, `IF EXISTS`, etc.)
4. `npm run db:migrate`

## "Check db for deploy" workflow

When the user says "check db for deploy", run this full checklist:

1. Read the latest migration SQL file — verify every statement is idempotent (`IF EXISTS`, `IF NOT EXISTS`, `DO $$ ... END $$`)
2. `npx drizzle-kit push` — confirm DB schema matches Drizzle schema (should say "Changes applied" with no pending diffs)
3. `npm run check` — TypeScript must pass clean
4. Confirm the Drizzle journal (`migrations/meta/_journal.json`) includes the latest migration entry
5. Report result: safe to deploy, or list what needs fixing

## Public API documentation — single source of truth

Viali's public API docs live in **one file**: the `PUBLIC_API_MD` string in `server/routes/publicDocs.ts`. That file feeds:

- `/api.md` — raw Markdown for AI agents, Make/Zapier, third-party scripts
- `/api` — human-friendly rendered version (`client/src/pages/PublicApiDocs.tsx` fetches `/api.md` and renders it with react-markdown)
- `/llms.txt` — agent index pointing at `/api.md`

**Whenever you add, remove, or change the shape of a publicly-exposed endpoint or URL parameter, update `PUBLIC_API_MD` in the same commit.** This includes:

- New webhook endpoints under `/api/webhooks/*` or any other public-facing route
- New, removed, or renamed URL parameters on `/book/:token`
- Changes to the leads webhook payload fields or the conversions API response schema
- Changes to error codes, auth behavior, or rate limits

If a change is internal-only (auth-gated admin endpoints, not public webhooks), no docs update is needed.

`tests/public-docs.test.ts` enforces that every documented endpoint path, required field, and error code is present in the served markdown — adding a new public endpoint without updating `PUBLIC_API_MD` should make those tests fail, so update the tests to match the new surface area.

## Cal.com integration (LEGACY)

Cal.com is **no longer used** for booking — all appointment booking is now handled natively in Viali via `/book`. Do NOT call `syncAvailabilityToCalcom` or any Cal.com sync functions from new code. The Cal.com service files and DB tables (`calcom_config`, `calcom_provider_mappings`) still exist but are legacy/inactive.

## Datetime / timezone rule

When handling datetime objects — display, input parsing, day-boundary comparisons, or anything that turns a wall-clock string into an absolute instant — **always respect the hospital's timezone** configured in `/admin → Settings → Regional Preferences → Timezone` (`hospitals.timezone`, default `Europe/Zurich`). The same applies to regional formatting (date format: european/american; hour format: 24h/12h).

- For **display**, use the helpers in `client/src/lib/dateUtils.ts` (`formatDateTime`, `formatDate`, `formatTime`, `formatDateTimeForInput`). They already read the hospital's regional config applied globally via `applyHospitalSettings`.
- For **input parsing**, use `dateTimeLocalToISO` — not raw `new Date(value)`, which silently double-counts the local offset.
- For **day-boundary / congruence checks** (e.g. "is admission on the same day as surgery?"), always format both instants in the hospital timezone before comparing (see `shared/admissionCongruence.ts` `localDayKey` for the pattern using `Intl.DateTimeFormat("en-CA", { timeZone })`).
- Never hardcode `"Europe/Zurich"`, `"de-CH"`, or specific date formats in components. Reach for the centralized helpers.

If the helpers don't cover a case, extend them there rather than branching locally.

## Communication

Use simple, everyday language.

## Code Review Reference (2026-02-18)

Review of discharge medications + regional blocks changes. Action items:

| # | Section | Issue | Decision |
|---|---------|-------|----------|
| 2 | Code Quality | Block definitions (IDs + labels) repeated across PatientDetail, PreOpOverview, AnesthesiaDocumentation | Extract shared constant |
| 3 | Tests | No tests for medication template CRUD routes/storage | Add integration tests |
| 4 | Performance | N+1 query in `getDischargeMedicationTemplates` (1 query per template for items) | Batch with single query |
