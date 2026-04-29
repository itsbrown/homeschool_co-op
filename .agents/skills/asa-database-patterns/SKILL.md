---
name: asa-database-patterns
description: Database schema conventions, data relationships, storage patterns, and date/schedule handling for the ASA Learning Platform. Use when modifying database schema, writing storage methods, creating API endpoints that query data, or working with dates, schedules, enrollments, and proration calculations.
---

# ASA Database Patterns

## Core Rules

- **Never query DB directly from routes**: All data access goes through the `IStorage` interface in `server/storage.ts`
- **Financial amounts in cents**: Always store as integers (cents), convert on display — `(amountCents / 100).toFixed(2)`
- **Use `effective_balance`, not `remainingBalance`**: `remainingBalance` is unreliable (set to `0` for deposits and comped accounts) — use the PostgreSQL generated column `effective_balance`
- **`getDb()` is one-shot**: `connectionTested` is set on first call — a startup DB timeout causes all subsequent calls to throw for the lifetime of the process; never assume permanent failure from a single startup error
- **Distinguish DB errors from not-found**: A throw from `getDb()` means the DB is unreachable; `null`/`undefined` means not found — handle these two cases separately in any access-control path
- **Postgres `date` columns require `YYYY-MM-DD` strings**: Never pass JavaScript `Date` objects — the driver throws `ERR_INVALID_ARG_TYPE`

## Database Connection

- **`DATABASE_URL` is the single source of truth.** Read the connection string only from `process.env.DATABASE_URL`. The legacy `PGHOST` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` / `PGPORT` fallback and the legacy Supabase-URL fallback have been removed — do not reintroduce them.
- **SSL is conditional on `NODE_ENV`.** Replit dev uses Helium Postgres, which speaks plain TCP and rejects SSL handshakes (`The server does not support SSL connections`). Production uses a managed Postgres that requires SSL. **Never hardcode `ssl: { rejectUnauthorized: false }` or `ssl: 'require'`** on a new client — always go through the shared helper.
- **Use the shared helper in `server/lib/database-url.ts`** for every new `pg` Pool or `postgres.js` client:
  - `getDbSslConfig()` — for `pg` (`new Pool({ ssl })`).
  - `getPostgresJsSslOption()` — for `postgres.js` (`postgres(url, { ssl })`).
  Both return `{ rejectUnauthorized: false }` in production and `false` everywhere else.

### Snippet: opening a new connection

`postgres.js` (preferred — used by `server/db.ts`):

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getPostgresJsSslOption } from './lib/database-url';
import * as schema from '../shared/schema';

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 10,
  ssl: getPostgresJsSslOption(),
});
const db = drizzle(client, { schema });
```

`pg` Pool (for one-off scripts or libraries that require `pg`):

```ts
import { Pool } from 'pg';
import { getDbSslConfig } from './lib/database-url';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getDbSslConfig(),
});
```

Plain `.mjs` scripts can import the same logic from `server/lib/database-url.mjs` without a TypeScript build step.

## Schema Conventions

- **Column naming**: snake_case in PostgreSQL, camelCase in Drizzle schema (e.g., `parent_id` in DB → `parentId` in code)
- **Insert schemas**: Use `createInsertSchema(table).omit({ id: true, createdAt: true, ... })` to exclude auto-generated fields
- **Array columns**: Call `.array()` as a method on the column type: `text().array()` NOT `array(text())`
- **Financial amounts**: Always stored in **cents** (integer), never dollars. Convert on display: `(amountCents / 100).toFixed(2)`
- **Primary keys**: Never change existing ID column types (serial ↔ varchar). This breaks migrations.

## Key Data Relationships

### Children → Parents → Emergency Contacts
```
children.parentId → users.id (parent)
children.parentEmail → quick lookup field (denormalized)
emergency_contacts.userId → users.id → separate emergency contacts table (supports multiple)
```
**Emergency contact priority**: User table fields first → `emergency_contacts` table fallback → `children.emergencyContact` legacy fallback.

### Enrollments
```
program_enrollments → marketplace class enrollments (classType = 'marketplace')
  .marketplaceClassId → classes.id
  .childId → children.id
  .parentEmail → denormalized parent email

school_class_enrollments → school-managed class enrollments
  .classId → school_classes.id
```
**Enrollment financial fields** (all in cents): `totalCost`, `totalPaid`, `remainingBalance`, `compAmountCents`, `effectiveBalance`. Note: `remainingBalance` is **unreliable** — use `effective_balance` (PostgreSQL generated column) instead.

## Storage Interface Pattern

- All data access goes through the `IStorage` interface in `server/storage.ts`
- **Never query the database directly from route handlers**
- Routes should be thin: validate input → call storage method → return response

### Adding New Operations
1. Add method signature to `IStorage` interface
2. Implement in the storage class (database-backed with memory fallback)
3. Use the method in route handlers via `storage.methodName()`

## Date & Schedule Patterns

### Date Storage Types
| Field | Type | Format |
|-------|------|--------|
| `birthdate` | `date` | YYYY-MM-DD |
| `startDate`, `endDate` (classes) | `date` or `timestamp` | varies |
| `scheduledDate` (sessions) | `text` | YYYY-MM-DD |
| `scheduledStartTime`, `scheduledEndTime` | `text` | HH:MM |

### Date Display & Parsing
- Use `formatDate()` from `@/lib/utils` for display — handles ISO strings without timezone shift
- For Postgres `date` columns: **always pass `YYYY-MM-DD` strings, never JavaScript `Date` objects** — passing a `Date` object causes `ERR_INVALID_ARG_TYPE` from the Postgres driver
- Parse external date input (CSV/forms) with regex: extract year/month/day components, reassemble as string — never use `new Date(userInput)` as intermediate step. See `parseDateToYMD()` in `server/api/csv-upload.ts`
- For age calculations: use millisecond math with 365.25 divisor, not year subtraction
- Always normalize dates to midnight (`setHours(0,0,0,0)`) before day-based comparisons

### Schedule Format (Classes)
```json
{ "variants": [{ "name": "Morning", "startTime": "09:00", "endTime": "12:00", "days": ["Monday"] }] }
```
Use `formatClassSchedule()` from `@/lib/utils` to display.

### Proration Date Math
Located in `server/lib/prorate-calculator.ts` — `totalDays = ceil((endDate - startDate) / oneDay)`, `daysRemaining = ceil((endDate - enrollmentDate) / oneDay)`, `proratedPrice = round(originalPrice * daysRemaining / totalDays)`.

## Migration Rules

- **Never write raw SQL migrations** — use `npm run db:push` (see exception below)
- Never change primary key column types
- Schema file: `shared/schema.ts`

### ⚠️ Project-Specific Exception: db:push Is Blocked in This Environment

`npm run db:push` crashes due to a drizzle-kit bug (functional unique index on `user_roles` uses `COALESCE` expression that drizzle-kit cannot parse). **Established workaround**: Add idempotent `ALTER TABLE` statements to `server/init-db.ts`:
```sql
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS my_column TEXT;
ALTER TABLE my_table ALTER COLUMN my_column DROP NOT NULL;
```
Place inside the relevant migration try-catch block in `server/init-db.ts`. The app runs these on startup — safe to re-run on every restart.

## Derived Financial Fields

### ⚠️ Why `remainingBalance` Is Unreliable
Set to `0` (not NULL) for `deposit_only`/`stripe_managed` enrollments after a deposit and for comped accounts — `COALESCE` won't help. **Never use `remainingBalance` for financial report aggregations.**

### The `effective_balance` Generated Column (Gold Standard)
`program_enrollments.effective_balance` is a PostgreSQL `GENERATED ALWAYS AS STORED` column:
```sql
effective_balance = total_cost - total_paid - COALESCE(comp_amount_cents, 0)
```
Use in SQL queries (`WHERE effective_balance > 0`) and in TypeScript: `enrollment.totalCost - enrollment.totalPaid - (enrollment.compAmountCents ?? 0)`.

### Financial Report Aggregations
Query `program_enrollments` directly — **not `scheduled_payments`** — for outstanding balance totals. Many enrollments have remaining balances but no `scheduled_payments` records (legacy enrollments, comped plans).

**Auto-heal at read time**: When a report endpoint fetches enrollment records, it can cancel stale `scheduled_payments` in the same pass using fire-and-forget: `storage.updateScheduledPaymentStatus(id, 'cancelled').catch(() => {})`. Pattern used in `server/api/financial-reports.ts`.

## Common Pitfalls

- **`remainingBalance` is unreliable for aggregations**: `0` (not NULL) for deposits and comped accounts — `COALESCE` won't help. Use `effective_balance` in SQL or `totalCost - totalPaid - (compAmountCents ?? 0)` in TypeScript.
- **Outstanding balance undercount**: `SUM(scheduled_payments.amount WHERE status='pending')` misses families with no scheduled_payment records — always use `effective_balance FROM program_enrollments`.
- **Express route ordering**: Specific named routes (e.g., `/classes/assignments`) BEFORE parameterized routes (e.g., `/classes/:id`)
- **Orphaned data**: `scheduled_payments` with deleted `program_enrollments` must be filtered out of admin views
- **Auth ID mapping**: Use `authData.dbUserId` (integer) NOT `authData.userId` (Supabase UUID) when querying database tables
- **`getDb()` one-shot connection test**: `connectionTested` is set to `true` on the first call — if the DB times out at startup, every subsequent `getDb()` call throws for the lifetime of the process with no retry. Never assume a permanent DB failure from a single startup error; check server logs and consider process restart to recover.

## Best Practices

### Do
- Always go through the `IStorage` interface — never import `db` directly in route handlers
- Use `Promise.all()` for independent lookups (e.g., fetching parent + emergency contacts in parallel)
- Avoid `getAllX()` methods in hot paths — use filtered queries (e.g., `getEnrollmentsByChildId` instead of filtering `getAllEnrollments()`)
- Always handle the "not found" case — return `undefined` from storage, check it in the route
- Store dates as `date` type (YYYY-MM-DD) for calendar/schedule dates, `timestamp` for event times
- Always define nullable fields explicitly with `.default(null)` in insert schemas
- Add unique constraints for natural keys (e.g., enrollment + date + installment number)
- Distinguish a thrown DB exception from a `null` return — a throw means the DB is unreachable; `null`/`undefined` means not found. Handle these two cases separately in any access-control or lookup path.

### Don't
- Don't use `new Date(userInput)` when inserting into Postgres `date` columns — pass `YYYY-MM-DD` strings directly
- Don't use `remainingBalance` for financial aggregations — use `effective_balance` or the TypeScript formula
- Don't query `scheduled_payments` for outstanding balance totals — use `program_enrollments`
- Don't add columns without defaults to tables with existing data — use `.default()` or make nullable
- Don't rename columns — add new, migrate data, remove old
- Don't assume a thrown DB exception means the user/record doesn't exist — a throw means the DB is unreachable; only a `null` return means not found. Return `503` for DB errors, not `403`/`404`.

## Key Files
- `shared/schema.ts` — all Drizzle table definitions, insert schemas, and inferred types
- `server/storage.ts` — `IStorage` interface and all storage method implementations
- `server/db.ts` — `getDb()` lazy loader with one-shot connection test (`connectionTested` flag)
- `server/init-db.ts` — idempotent `ALTER TABLE` migrations run on startup (replaces `db:push`)
- `server/lib/database-url.ts` — `getDbSslConfig()` / `getPostgresJsSslOption()` helpers; SSL on in production, off in dev (Helium). Sibling `database-url.mjs` shares the same logic for plain ESM scripts.
- `server/lib/prorate-calculator.ts` — proration date math
- `server/api/csv-upload.ts` — `parseDateToYMD()` and `addMonthsYMD()` date string helpers
- `server/api/financial-reports.ts` — outstanding balances report with auto-heal pattern
