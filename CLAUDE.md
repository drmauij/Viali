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

## Public API documentation — keep in sync

Viali publishes its public API at `/api` (React page in `client/src/pages/PublicApiDocs.tsx`) and a machine-readable index at `/llms.txt` (served by `server/routes/publicDocs.ts`). These are the docs third parties and AI agents rely on.

**Whenever you add, remove, or change the shape of a publicly-exposed endpoint or URL parameter, update these docs in the same commit.** This includes:

- New webhook endpoints under `/api/webhooks/*` or any other public-facing route — add a new section to `PublicApiDocs.tsx` (and an `id` to `SECTIONS`) and a new link in `LLMS_TXT` if it warrants its own entry.
- New, removed, or renamed URL parameters on `/book/:token` — update the relevant `BOOKING_PARAMS_*` array in `PublicApiDocs.tsx`.
- Changes to the leads webhook payload fields or the conversions API response schema — update the corresponding section.
- Changes to error codes, auth behavior, or rate limits — reflect them in the docs.

If a change is internal-only (auth-gated admin endpoints, not public webhooks), no docs update is needed.

When in doubt: the `/api` page should always describe the current behavior of every endpoint documented there. If you can't make it match the code, flag it rather than letting it drift.

## Cal.com integration (LEGACY)

Cal.com is **no longer used** for booking — all appointment booking is now handled natively in Viali via `/book`. Do NOT call `syncAvailabilityToCalcom` or any Cal.com sync functions from new code. The Cal.com service files and DB tables (`calcom_config`, `calcom_provider_mappings`) still exist but are legacy/inactive.

## Communication

Use simple, everyday language.

## Code Review Reference (2026-02-18)

Review of discharge medications + regional blocks changes. Action items:

| # | Section | Issue | Decision |
|---|---------|-------|----------|
| 2 | Code Quality | Block definitions (IDs + labels) repeated across PatientDetail, PreOpOverview, AnesthesiaDocumentation | Extract shared constant |
| 3 | Tests | No tests for medication template CRUD routes/storage | Add integration tests |
| 4 | Performance | N+1 query in `getDischargeMedicationTemplates` (1 query per template for items) | Batch with single query |
