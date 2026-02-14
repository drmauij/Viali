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

## Communication

Use simple, everyday language.
