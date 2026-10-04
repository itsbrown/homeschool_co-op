# Agent instructions

## Database schema

Never run `db:push`, `drizzle-kit push`, or `sync_schema.mjs` against production.

- Production schema changes are additive SQL files in `server/migrations/`.
- `npm run db:push` is guarded by `scripts/guard-db-push.mjs` (also enforced from `drizzle.config.ts` when the command is `push`). It refuses when `NODE_ENV=production`, when `REPLIT_DEPLOYMENT` is set, when `DATABASE_URL` points at a known production host, or when `ALLOW_DB_PUSH` is not exactly `1`.
- `ALLOW_DB_PUSH=1` is only for a disposable local or CI database. It does not override production indicators.
- Do not add `db:push` or `drizzle-kit push` to Replit run/deployment commands, `postinstall`, `start`, `build`, or server startup.
- Do not commit connection strings, service-role keys, or Stripe secrets. Tooling output (`*_output.txt`) and `.env*` files are gitignored.

See `docs/APP_KNOWLEDGE/README.md`.
