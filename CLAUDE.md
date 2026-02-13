# CLAUDE.md

Read `replit.md` for full project context (architecture, stack, conventions).

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
